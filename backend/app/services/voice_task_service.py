"""Voice Task Service for transcribing voice commands and extracting structured task proposals."""
from __future__ import annotations

import asyncio
import json
import logging
import re
import difflib
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

import httpx
from fastapi import HTTPException, Request, status

from app.config import settings

logger = logging.getLogger("app.services.voice_task")

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
WHISPER_MODEL = "whisper-large-v3-turbo"
DEFAULT_LLM_MODELS = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
]

# Request limits (413 as a literal: the Starlette constant name differs across versions)
HTTP_413_TOO_LARGE = 413
MAX_AUDIO_BYTES = 3 * 1024 * 1024
MIN_AUDIO_BYTES = 1024
MAX_TEXT_CHARS = 600
MAX_FORM_OVERHEAD = 64 * 1024
MAX_JSON_BODY_BYTES = MAX_TEXT_CHARS * 4 + 1024
READ_CHUNK_BYTES = 64 * 1024

# Provider time budget (whole request: Whisper + LLM)
VOICE_DEADLINE_SECONDS = 28.0
WHISPER_TIMEOUT_SECONDS = 12.0
LLM_CALL_TIMEOUT_SECONDS = 15.0
MIN_CALL_SECONDS = 2.0

ALLOWED_AUDIO_TYPES = {
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
    "audio/aac",
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
}

# Fixed client-facing messages (provider text never reaches the client)
MSG_TOO_LARGE = "Recording is too large. Keep voice commands under 60 seconds."
MSG_TEXT_TOO_LONG = "Command is too long (max 600 characters)."
MSG_UNSUPPORTED_AUDIO = "Unsupported audio format."
MSG_AUDIO_AS_MULTIPART = "Send audio as multipart form data."
MSG_TOO_SHORT = "Audio recording is empty or too short. Please speak clearly and try again."
MSG_NOT_CONFIGURED = "Voice service is not configured."
MSG_TRANSCRIBE_FAILED = "Voice transcription is unavailable right now. Please try again or type the task."
MSG_BUSY = "Voice service is busy. Please try again in a minute."
MSG_EXTRACT_FAILED = "Could not understand the command right now. Please try again or type the task."
MSG_TIMEOUT = "Voice service timed out. Please try again."

_NULLABLE_STRING = {"type": ["string", "null"]}
_STRING_ARRAY = {"type": "array", "items": {"type": "string"}}

VOICE_TASK_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "is_task": {"type": "boolean"},
        "title": {"type": "string"},
        "description": {"type": "string"},
        "assignee_name": _NULLABLE_STRING,
        "assignee_id": _NULLABLE_STRING,
        "spoken_assignee": _NULLABLE_STRING,
        "ambiguous_names": _STRING_ARRAY,
        "watcher_names": _STRING_ARRAY,
        "watcher_ids": _STRING_ARRAY,
        "spoken_watchers": _STRING_ARRAY,
        "company_id": _NULLABLE_STRING,
        "company_name": _NULLABLE_STRING,
        "spoken_company": _NULLABLE_STRING,
        "start_date": _NULLABLE_STRING,
        "due_date": _NULLABLE_STRING,
        "due_time": _NULLABLE_STRING,
        "estimate_hours": {"type": ["number", "null"]},
        "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]},
        "checklist": _STRING_ARRAY,
        "is_collective": {"type": "boolean"},
        "subtasks": {"type": "array", "items": None},
    },
    "required": [
        "is_task", "title", "description", "assignee_name", "assignee_id",
        "spoken_assignee", "ambiguous_names", "watcher_names", "watcher_ids",
        "spoken_watchers", "company_id", "company_name", "spoken_company",
        "start_date", "due_date", "due_time", "estimate_hours", "priority", "checklist",
        "is_collective", "subtasks",
    ],
    "additionalProperties": False,
}

MAX_VOICE_SUBTASKS = 10

VOICE_SUBTASK_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "description": {"type": "string"},
        "assignee_name": _NULLABLE_STRING,
        "assignee_id": _NULLABLE_STRING,
        "spoken_assignee": _NULLABLE_STRING,
        "due_date": _NULLABLE_STRING,
        "estimate_hours": {"type": ["number", "null"]},
    },
    "required": ["title", "description", "assignee_name", "assignee_id", "spoken_assignee", "due_date", "estimate_hours"],
    "additionalProperties": False,
}
VOICE_TASK_SCHEMA["properties"]["subtasks"]["items"] = VOICE_SUBTASK_SCHEMA

_COLLECTIVE_WORDS = re.compile(r"\b(collective|project|sub[\s-]?tasks?)\b", re.IGNORECASE)


def _get_groq_api_key() -> str:
    key = (settings.GROQ_API_KEY or "").strip()
    if not key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=MSG_NOT_CONFIGURED)
    return key


def _new_deadline() -> float:
    return time.monotonic() + VOICE_DEADLINE_SECONDS


def _remaining(deadline: float) -> float:
    return deadline - time.monotonic()


def _is_retryable_status(code: int) -> bool:
    return code == 429 or code >= 500


# ── Request reading (size, type and magic-byte checks) ─────────────────

def detect_audio_format(data: bytes) -> Optional[Tuple[str, str]]:
    """Return (extension, mime) from the file's magic bytes, or None."""
    if len(data) < 12:
        return None
    if data[:4] == b"\x1a\x45\xdf\xa3":
        return "webm", "audio/webm"
    if data[:4] == b"OggS":
        return "ogg", "audio/ogg"
    if data[4:8] == b"ftyp":
        return "m4a", "audio/mp4"
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return "wav", "audio/wav"
    if data[:3] == b"ID3" or (data[0] == 0xFF and (data[1] & 0xE0) == 0xE0):
        return "mp3", "audio/mpeg"
    return None


def _declared_type_allowed(content_type: Optional[str]) -> bool:
    base = (content_type or "").split(";", 1)[0].strip().lower()
    return base in ALLOWED_AUDIO_TYPES


async def _read_body_limited(request: Request, limit: int) -> bytes:
    """Read the request body in chunks, aborting with 413 once `limit` is passed."""
    raw_len = request.headers.get("content-length")
    if raw_len is not None:
        try:
            declared = int(raw_len)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Content-Length header.")
        if declared < 0 or declared > limit:
            raise HTTPException(status_code=HTTP_413_TOO_LARGE, detail=MSG_TOO_LARGE)

    buf = bytearray()
    async for chunk in request.stream():
        buf.extend(chunk)
        if len(buf) > limit:
            raise HTTPException(status_code=HTTP_413_TOO_LARGE, detail=MSG_TOO_LARGE)
    body = bytes(buf)
    # Let Starlette's json()/form() parse the already-bounded body.
    request._body = body
    return body


def _clean_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if len(text) > MAX_TEXT_CHARS:
        raise HTTPException(status_code=HTTP_413_TOO_LARGE, detail=MSG_TEXT_TOO_LONG)
    return text


async def read_voice_request(request: Request) -> Dict[str, Any]:
    """Read a voice-parse request safely.

    Returns {"audio": bytes | None, "audio_ext": str, "audio_mime": str, "text": str | None}.
    """
    content_type = request.headers.get("content-type", "").lower()
    out: Dict[str, Any] = {"audio": None, "audio_ext": "", "audio_mime": "", "text": None}

    if "application/json" in content_type:
        await _read_body_limited(request, MAX_JSON_BODY_BYTES)
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload.")
        if not isinstance(body, dict):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload.")
        if body.get("audio_base64"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=MSG_AUDIO_AS_MULTIPART)
        out["text"] = _clean_text(body.get("text"))
        return out

    await _read_body_limited(request, MAX_AUDIO_BYTES + MAX_FORM_OVERHEAD)
    try:
        form = await request.form(max_files=1, max_fields=2)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to parse form data.")

    audio_field = form.get("audio")
    if audio_field is not None and hasattr(audio_field, "read"):
        buf = bytearray()
        while True:
            chunk = await audio_field.read(READ_CHUNK_BYTES)
            if not chunk:
                break
            buf.extend(chunk)
            if len(buf) > MAX_AUDIO_BYTES:
                raise HTTPException(status_code=HTTP_413_TOO_LARGE, detail=MSG_TOO_LARGE)
        audio = bytes(buf)
        if len(audio) < MIN_AUDIO_BYTES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=MSG_TOO_SHORT)
        detected = detect_audio_format(audio)
        if not detected or not _declared_type_allowed(getattr(audio_field, "content_type", None)):
            raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=MSG_UNSUPPORTED_AUDIO)
        out["audio"] = audio
        out["audio_ext"], out["audio_mime"] = detected

    form_text = form.get("text")
    if form_text is not None and not hasattr(form_text, "read"):
        out["text"] = _clean_text(form_text)
    return out


COMMON_NAME_EQUIVALENTS = {
    "mohammad": "muhammad",
    "mohammed": "muhammad",
    "mohd": "muhammad",
    "md": "muhammad",
    "osman": "usman",
    "othman": "usman",
    "humza": "hamza",
    "hasan": "hassan",
    "husain": "hussain",
    "ahmed": "ahmad",
    "tareq": "tariq",
    "zahed": "zahid",
    "bilaal": "bilal",
}


def _normalize_name_token(token: str) -> str:
    clean = re.sub(r"[^a-zA-Z0-9]", "", token.lower())
    return COMMON_NAME_EQUIVALENTS.get(clean, clean)


def _phonetic_name_key(token: str) -> str:
    """Spelling-neutral key for Roman Urdu names: Shahmeer/Shameer/Shamir -> shamir, Harris -> haris."""
    key = token.replace("ee", "i").replace("oo", "u")
    key = re.sub(r"(.)\1+", r"\1", key)
    return re.sub(r"([aeiou])h(?=[^aeiou]|$)", r"\1", key)


async def transcribe_audio(
    audio_bytes: bytes,
    audio_ext: str = "m4a",
    audio_mime: str = "audio/mp4",
    roster_hint: Optional[List[Dict[str, Any]]] = None,
    workspace_hint: Optional[List[Dict[str, Any]]] = None,
    deadline: Optional[float] = None,
) -> str:
    """Transcribe voice audio to text using Groq Whisper Large v3 Turbo."""
    if not audio_bytes or len(audio_bytes) < 100:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=MSG_TOO_SHORT)

    api_key = _get_groq_api_key()
    if deadline is None:
        deadline = _new_deadline()

    # Build prompt hint from team members and companies to bias acoustic decoder towards correct spelling
    prompt_words: List[str] = []
    if roster_hint:
        for u in roster_hint[:30]:  # Keep prompt under Whisper token limit
            name = (u.get("name") or "").strip()
            if name:
                prompt_words.append(name)
    if workspace_hint:
        for w in workspace_hint[:15]:
            wname = (w.get("name") or "").strip()
            if wname:
                prompt_words.append(wname)
    prompt_str = ", ".join(prompt_words) if prompt_words else "Task, project, urgent, meeting, review"

    headers = {
        "Authorization": f"Bearer {api_key}",
    }

    # Fixed filename: never forward the client's filename or declared type.
    files = {
        "file": (f"voice.{audio_ext or 'm4a'}", audio_bytes, audio_mime or "audio/mp4"),
    }
    data = {
        "model": WHISPER_MODEL,
        "response_format": "json",
        "temperature": "0.0",
        "prompt": prompt_str,
    }

    budget = min(WHISPER_TIMEOUT_SECONDS, _remaining(deadline))
    if budget < MIN_CALL_SECONDS:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=MSG_TIMEOUT)

    try:
        async with httpx.AsyncClient(timeout=budget) as client:
            resp = await asyncio.wait_for(
                client.post(
                    f"{GROQ_BASE_URL}/audio/transcriptions",
                    headers=headers,
                    files=files,
                    data=data,
                ),
                timeout=budget,
            )
    except (asyncio.TimeoutError, httpx.TimeoutException):
        logger.warning("groq_whisper_timeout")
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=MSG_TIMEOUT)
    except httpx.RequestError as exc:
        logger.warning("groq_whisper_network_error type=%s", type(exc).__name__)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=MSG_TRANSCRIBE_FAILED)

    if resp.status_code != 200:
        logger.warning("groq_whisper_failed status=%s", resp.status_code)
        if resp.status_code == 429:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=MSG_BUSY)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=MSG_TRANSCRIBE_FAILED)

    try:
        result = resp.json()
    except Exception:
        logger.warning("groq_whisper_bad_json")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=MSG_TRANSCRIBE_FAILED)
    transcript = (result.get("text") or "").strip()
    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No intelligible speech detected. Please speak closer to the microphone and try again.",
        )

    return transcript[:MAX_TEXT_CHARS]


def _find_matching_candidates(
    spoken_name: str,
    assignable_users: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Accurate matching for spoken employee names against assignable users,
    supporting Pakistani/Urdu phonetics with strict dropdown isolation.
    NEVER matches unrelated substrings (e.g. 3-letter parts in words).
    """
    if not spoken_name:
        return []

    spoken_clean = re.sub(r"\s+", " ", spoken_name.lower().strip())
    spoken_tokens = [_normalize_name_token(p) for p in spoken_clean.split() if _normalize_name_token(p)]
    if not spoken_tokens:
        return []

    exact_matches: List[Dict[str, Any]] = []
    token_matches: List[Dict[str, Any]] = []
    fuzzy_matches: List[Dict[str, Any]] = []

    honorifics = {"mr", "mrs", "miss", "ms", "syed", "hafiz", "mian", "malik", "chaudhry", "raja", "sheikh"}

    for u in assignable_users:
        uname = (u.get("name") or "").strip()
        if not uname:
            continue

        uname_clean = re.sub(r"\s+", " ", uname.lower().strip())
        uname_tokens = [_normalize_name_token(p) for p in uname_clean.split() if _normalize_name_token(p)]
        if not uname_tokens:
            continue

        # 1. Exact match (full string or normalized token join)
        if spoken_clean == uname_clean or " ".join(spoken_tokens) == " ".join(uname_tokens):
            exact_matches.append(u)
            continue

        core_spoken = [t for t in spoken_tokens if t not in honorifics]
        core_uname = [t for t in uname_tokens if t not in honorifics]
        if not core_spoken or not core_uname:
            continue

        # 2. Word boundary / First name or Last name match (spelling-neutral keys)
        spoken_keys = {_phonetic_name_key(t) for t in core_spoken}
        uname_keys = {_phonetic_name_key(t) for t in core_uname}
        if spoken_keys & uname_keys:
            if spoken_keys.issubset(uname_keys) or uname_keys.issubset(spoken_keys):
                exact_matches.append(u)
                continue
            else:
                token_matches.append(u)
                continue
        # "Shah Meer" spoken for "Shahmeer" (or the reverse)
        if (len(core_spoken) > 1 and _phonetic_name_key("".join(core_spoken)) in uname_keys) or (
            len(core_uname) > 1 and _phonetic_name_key("".join(core_uname)) in spoken_keys
        ):
            exact_matches.append(u)
            continue

        # 3. High-confidence fuzzy string similarity (>= 0.85)
        spoken_joined = " ".join(core_spoken)
        uname_joined = " ".join(core_uname)
        ratio = difflib.SequenceMatcher(None, spoken_joined, uname_joined).ratio()
        if ratio >= 0.85:
            fuzzy_matches.append(u)
            continue

        max_token_ratio = max(
            (difflib.SequenceMatcher(None, st, ut).ratio() for st in core_spoken for ut in core_uname),
            default=0.0,
        )
        if max_token_ratio >= 0.88 and min(len(st) for st in core_spoken) >= 4:
            fuzzy_matches.append(u)

    if exact_matches:
        return exact_matches
    if token_matches:
        return token_matches
    return fuzzy_matches


def _find_matching_company(
    spoken_company: Optional[str],
    workspaces: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Match spoken company/client name against active workspaces."""
    if not spoken_company or not workspaces:
        return None

    clean_spoken = re.sub(r"\s+", " ", spoken_company.lower().strip())
    if not clean_spoken:
        return None

    stripped_spoken = re.sub(r"\b(company|client|workspace|ltd|inc|llc|corp)\b", "", clean_spoken).strip()
    target = stripped_spoken if stripped_spoken else clean_spoken

    for w in workspaces:
        wname = (w.get("name") or "").lower().strip()
        stripped_w = re.sub(r"\b(company|client|workspace|ltd|inc|llc|corp)\b", "", wname).strip()
        w_target = stripped_w if stripped_w else wname

        if clean_spoken == wname or target == w_target:
            return w
        if len(target) >= 3 and (target in w_target or w_target in target):
            return w
        if difflib.SequenceMatcher(None, target, w_target).ratio() >= 0.82:
            return w

    return None


def _valid_ymd(value: Any) -> Optional[str]:
    text = str(value or "").strip()
    return text if re.match(r"^\d{4}-\d{2}-\d{2}$", text) else None


def _valid_hours(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        val = float(value)
    except (ValueError, TypeError):
        return None
    return round(val, 2) if 0 <= val <= 1000 else None


def _resolve_subtask(raw: Dict[str, Any], assignable_users: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Roster-locked assignee for one spoken sub-task (same rules as the main assignee)."""
    title = str(raw.get("title") or "").strip()[:200]
    if not title:
        return None
    aid = raw.get("assignee_id")
    aname = raw.get("assignee_name")
    spoken = raw.get("spoken_assignee") or aname
    out: Dict[str, Any] = {
        "title": title,
        "description": str(raw.get("description") or "").strip()[:10000],
        "assignee_id": None,
        "assignee_name": None,
        "assignee_status": "unassigned",
        "ambiguous_candidates": [],
        "unrecognized_assignee": None,
        "due_date": _valid_ymd(raw.get("due_date")),
        "estimate_hours": _valid_hours(raw.get("estimate_hours")),
    }
    matched = next((u for u in assignable_users if u["id"] == aid), None) if aid else None
    if matched:
        out.update(assignee_id=matched["id"], assignee_name=matched["name"], assignee_status="matched")
        return out
    lookup = aname or spoken
    if not lookup:
        return out
    cands = _find_matching_candidates(str(lookup), assignable_users)
    if len(cands) == 1:
        out.update(assignee_id=cands[0]["id"], assignee_name=cands[0]["name"], assignee_status="matched")
    elif len(cands) > 1:
        out["assignee_status"] = "needs_selection"
        out["ambiguous_candidates"] = [
            {"id": c["id"], "name": c["name"], "department": c.get("department", ""), "role": c.get("role", "")}
            for c in cands
        ]
    elif spoken and str(spoken).strip():
        out["unrecognized_assignee"] = str(spoken).strip()
    return out


def _collective_from_parse(parsed: Dict[str, Any], transcript: str, assignable_users: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Sub-tasks only when the speaker asked for a collective task or gave 2+ owners with steps."""
    raw_subs = parsed.get("subtasks") if isinstance(parsed.get("subtasks"), list) else []
    if not parsed.get("is_collective") or not raw_subs:
        return []
    subs = [s for s in (_resolve_subtask(r, assignable_users) for r in raw_subs[:MAX_VOICE_SUBTASKS] if isinstance(r, dict)) if s]
    if not subs:
        return []
    owners = {
        str(r.get("assignee_id") or r.get("assignee_name") or r.get("spoken_assignee") or "").strip().lower()
        for r in raw_subs[:MAX_VOICE_SUBTASKS]
        if isinstance(r, dict)
    }
    owners.discard("")
    explicit = bool(_COLLECTIVE_WORDS.search(transcript or ""))
    if not explicit and not (len(subs) >= 2 and len(owners) >= 2):
        return []
    return subs


_NUMBER_WORDS = {
    "one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "six": "6",
    "seven": "7", "eight": "8", "nine": "9", "ten": "10", "eleven": "11", "twelve": "12",
}
_MONTHS = (
    "january|february|march|april|may|june|july|august|september|october|november|december"
    "|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec"
)
_DATE_EXPRESSION = re.compile(
    r"\b\d{4}-\d{2}-\d{2}\b"
    r"|\b\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)"
    r"|\b\d{1,2}:\d{2}\b"
    rf"|\b\d{{1,2}}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:{_MONTHS})\b(?:,?\s+\d{{4}})?"
    rf"|\b(?:{_MONTHS})\s+\d{{1,2}}(?:st|nd|rd|th)?\b(?:,?\s+\d{{4}})?",
    re.IGNORECASE,
)
_DATE_WORDS = set(_MONTHS.split("|")) | {
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "today", "tomorrow", "tonight", "noon", "midnight", "morning", "evening", "eod",
}
# Words that carry no work content: grammar, assignment talk and generic task words.
_NARRATION_WORDS = {
    "a", "an", "the", "and", "or", "of", "to", "for", "in", "on", "at", "by", "with", "from", "into",
    "is", "are", "be", "been", "was", "were", "will", "shall", "should", "must", "can", "has", "have",
    "need", "needs", "needed", "require", "requires", "required", "this", "that", "these", "those", "it",
    "its", "he", "she", "they", "them", "his", "her", "their", "who", "all", "each", "every", "both",
    "overall", "entire", "whole", "everything", "everyone", "also", "then", "as", "so", "while",
    "task", "tasks", "subtask", "subtasks", "sub", "collective", "main", "team", "lead", "leads", "leading", "owner", "owns",
    "own", "responsible", "responsibility", "assign", "assigned", "assignee", "assigning", "handle",
    "handles", "handling", "charge", "member", "members", "deliverable", "deliverables", "due",
    "deadline", "before", "until", "no", "later", "than", "date", "time", "work", "piece", "part",
}


def _content_word(word: str) -> str:
    word = _NUMBER_WORDS.get(word, word)
    if len(word) > 3 and word.endswith("s"):
        word = word[:-1]
    return word[:5] if len(word) > 5 and not word.isdigit() else word


def _work_description(
    description: str,
    title: str,
    subtasks: List[Dict[str, Any]],
    people: List[Optional[str]],
    has_date: bool,
) -> str:
    """Drop sentences that only narrate who does what and when (already in the fields).

    A sentence is kept whole when it has any word beyond the people involved, the
    captured date/time, the task and sub-task titles and generic assignment talk.
    """
    known = {_content_word(w) for text in [title] + [s.get("title") or "" for s in subtasks]
             for w in re.findall(r"[a-z0-9]+", text.lower())}
    name_keys = {
        _phonetic_name_key(_normalize_name_token(t))
        for name in people if name
        for t in str(name).split()
        if len(_normalize_name_token(t)) >= 3
    }
    kept: List[str] = []
    for sentence in re.split(r"(?<=[.!?;])\s+|\n+", description):
        if not sentence.strip():
            continue
        text = _DATE_EXPRESSION.sub(" ", sentence) if has_date else sentence
        words = re.findall(r"[a-z0-9]+", text.lower())
        novel = [
            w for w in words
            if w not in _NARRATION_WORDS
            and not (has_date and (w in _DATE_WORDS or re.fullmatch(r"(19|20)\d\d", w)))
            and _phonetic_name_key(_normalize_name_token(w)) not in name_keys
            and _content_word(w) not in known
        ]
        if novel:
            kept.append(sentence.strip())
    if kept:
        return " ".join(kept)
    # Nothing but narration: describe the work from the titles, never the raw command.
    parts = [title.strip()]
    sub_titles = [str(s.get("title") or "").strip() for s in subtasks if str(s.get("title") or "").strip()]
    if sub_titles:
        parts.append("Includes: " + "; ".join(sub_titles) + ".")
    return (parts[0].rstrip(".") + ".\n\n" + parts[1]) if len(parts) > 1 else parts[0]


_ROLE_WORDS = {"admin": ("admin", "super_admin"), "admins": ("admin", "super_admin"), "administrator": ("admin", "super_admin")}
_ASSIGN_PHRASES = re.compile(
    r"\b([a-z]+)\s+ko\s+(?:assign|de\s*do|sonp|saunp)"
    r"|\bassign(?:ed)?\s+(?:[a-z]+\s+){0,4}?to\s+([a-z]+)",
    re.IGNORECASE,
)
_WATCHER_PHRASES = re.compile(
    r"\bwatchers?\s+(?:me|mein|main|par|mai)\s+([a-z]+)\s+ko"
    r"|\b([a-z]+)\s+ko\s+(?:bhi\s+)?watchers?\b"
    r"|\badd\s+([a-z]+)\s+as\s+(?:a\s+)?watchers?\b",
    re.IGNORECASE,
)
_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def _role_people(word: str, assignable_users: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """'admin' spoken as a person: the roster users with that role."""
    roles = _ROLE_WORDS.get(str(word or "").strip().lower())
    if not roles:
        return []
    return [u for u in assignable_users if str(u.get("role") or "").strip().lower() in roles]


def _spoken_assignees(transcript: str, assignable_users: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Roster people named in assignment phrases ("haris ko assign", "assign to sibat"), in spoken order.

    Only names with exactly one roster match are returned; anything else is skipped, never guessed.
    """
    people: List[Dict[str, Any]] = []
    for m in _ASSIGN_PHRASES.finditer(transcript or ""):
        cands = _find_matching_candidates(m.group(1) or m.group(2), assignable_users)
        if len(cands) == 1:
            people.append(cands[0])
    return people


def _spoken_due(transcript: str, now: datetime) -> Tuple[Optional[str], Optional[str]]:
    """(YYYY-MM-DD, HH:MM) from a spoken day ("saturday", "kal", "tomorrow", "aaj") and time ("6pm")."""
    text = (transcript or "").lower()
    if not re.search(r"\b(by|due|deadline|before|until|tak|pehle)\b", text):
        return None, None  # a day without a deadline word may be a start day
    day: Optional[datetime] = None
    if re.search(r"\b(today|aaj)\b", text):
        day = now
    elif re.search(r"\b(tomorrow|kal)\b", text):
        day = now + timedelta(days=1)
    else:
        m = re.search(r"\b(" + "|".join(_WEEKDAYS) + r")\b", text)
        if m:
            day = now + timedelta(days=(_WEEKDAYS.index(m.group(1)) - now.weekday()) % 7)
    if day is None:
        return None, None
    due_time = None
    t = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", text)
    if t and 1 <= int(t.group(1)) <= 12 and int(t.group(2) or 0) < 60:
        hour = int(t.group(1)) % 12 + (12 if t.group(3) == "pm" else 0)
        due_time = f"{hour:02d}:{int(t.group(2) or 0):02d}"
    return day.strftime("%Y-%m-%d"), due_time


async def extract_task_from_transcript(
    transcript: str,
    assignable_users: List[Dict[str, Any]],
    workspaces: Optional[List[Dict[str, Any]]] = None,
    timezone_name: str = "Asia/Karachi",
    deadline: Optional[float] = None,
) -> Dict[str, Any]:
    """Parse a voice transcript into structured task fields using Groq GPT-OSS (strict JSON schema)."""
    api_key = _get_groq_api_key()
    if deadline is None:
        deadline = _new_deadline()
    transcript = (transcript or "").strip()[:MAX_TEXT_CHARS]

    # Current time anchor
    try:
        tz = ZoneInfo(timezone_name)
    except Exception:
        tz = ZoneInfo("UTC")
    now = datetime.now(tz)
    now_str = now.strftime("%A, %Y-%m-%d %H:%M")

    # Compact user list for context
    compact_roster = [
        {
            "id": u["id"],
            "name": u["name"],
            "role": u.get("role", ""),
            "department": u.get("department", ""),
        }
        for u in assignable_users
    ]

    compact_workspaces = [
        {"id": w["id"], "name": w["name"]}
        for w in (workspaces or [])
        if w.get("id") and w.get("name")
    ]

    system_prompt = f"""You are a precise multilingual task assignment parser for a project management system.
Current reference date and time: {now_str} (Timezone: {timezone_name}).

The voice command may be spoken in English, Urdu (Perso-Arabic Urdu script), or Roman Urdu (Urdu words transliterated into English letters, e.g. "Yeh task Hamza ko assign karo kal tak").
Your job is to read the transcribed voice command and extract task properties strictly as JSON.

Active Company Team Roster (EMPLOYEES DROPDOWN):
{json.dumps(compact_roster, separators=(",", ":"))}

Active Companies / Workspaces:
{json.dumps(compact_workspaces, separators=(",", ":"))}

CRITICAL RULES FOR EXTRACTION:
0. "is_task": boolean. Set to true if the voice command is a genuine instruction or request to create, assign, or track a task. Set to false if the speech is casual conversational talk (e.g. "how are you", "what's the weather today"), testing phrases ("hello testing 1 2 3", "mic check"), random chatter, or questions with no actionable task intent.
1. "title": Short, imperative, professional summary of the task in English (e.g. "Design social media banners", "Review financial audit"). Max 200 chars. Required. If the voice command was in Urdu, translate the action into a concise professional English title.
2. "description": A clear, professional description of the WORK itself: the objective, scope, deliverables, requirements and any specific details spoken (quantities, formats, platforms, references, e.g. "6 static posts"). This rule is about the description TEXT only: keep people's names and the due date/time out of the description, because they belong in the "assignee_*", "watcher_*", date and "subtasks" fields below, which you must still fill exactly as rules 3-20 say. Do not just repeat the voice command. For a collective task, describe the overall goal and what the finished whole includes, not who does each part. If nothing beyond the title was said, write one short sentence on what completing the task involves, without inventing requirements. Write in clear English (if spoken in Urdu or Roman Urdu, translate and articulate clearly in professional English). NEVER leave description empty or blank.
3. "assignee_name": MUST be chosen STRICTLY from the names in the "Active Company Team Roster" above if a matching employee is mentioned.
   - NEVER invent, guess, or output any name outside this roster.
   - If the spoken person cannot be found in the roster, output null.
4. "assignee_id": If the spoken name matches a person in the roster (taking into account Urdu/Pakistani spelling variations like Mohammad/Muhammad, Usman/Osman, Hamza/Humza, or department hints like "Hamza from design"), output their exact "id" from the roster.
   - Roman Urdu phrasing: "<name> ko assign karo" means assign to <name> (e.g. "haris ko assign karo" -> Haris).
   - Roman Urdu / transcription spellings of the same name are the same person (e.g. Shahmeer/Shamir/Shameer, Haris/Harris, Naveed/Navid): if exactly ONE roster person matches, output their "id" and exact roster "name".
   - If ambiguous (multiple people in the roster match) or if NO ONE in the roster matches, set to null.
5. "spoken_assignee": Raw name of any person spoken or mentioned for the task (e.g. "Junaid", "John"), or null if no person was mentioned.
6. "ambiguous_names": If multiple people from the roster match the spoken name (e.g. "Hamza" when there are 2 Hamzas), list their names. Otherwise empty array.
7. "watcher_names": Array of employee names mentioned as watchers, observers, or kept in the loop (e.g. "add Usman as watcher", "keep Sarah in loop", "watchers Bilal and Tariq", "watcher Ali", Urdu/Roman Urdu: "Usman ko watcher bana do", "Bilal ko bhi add karo as watcher", "Tariq ko loop mein rakho").
   - MUST be chosen STRICTLY from names in the "Active Company Team Roster".
   - A role word such as "admin" (e.g. "watcher me admin ko dalo") means the roster people with that role: put their names in "watcher_names" and "admin" in "spoken_watchers".
   - If no watchers are mentioned, return [].
8. "watcher_ids": Array of string "id"s from the "Active Company Team Roster" corresponding to "watcher_names". If none, return [].
9. "spoken_watchers": Array of raw spoken names of watchers/observers mentioned (e.g. ["Usman", "Sarah"]), or empty array [] if none.
10. "company_id": If a client or company from the "Active Companies / Workspaces" list is mentioned (e.g. "for Acme", "company Alpha"), output their exact "id". Otherwise null.
11. "company_name": Exact "name" from the "Active Companies / Workspaces" list corresponding to "company_id", or null.
12. "spoken_company": Raw name of any client or company spoken in the command (e.g. "Tesla", "Acme"), or null if no company was mentioned.
13. "start_date": Absolute start date string in "YYYY-MM-DD" format if mentioned (e.g. "starts tomorrow", "starting today", "from Friday"). If not mentioned, null.
14. "due_date": Absolute date string in "YYYY-MM-DD" format if mentioned (e.g. "today", "tomorrow", "this Friday", "by next Monday", Roman Urdu "aaj", "kal tak", "saturday 6pm se pehle" = by the coming Saturday). A weekday means its next occurrence from the reference date (today if it is today). If not mentioned, null.
15. "due_time": "HH:MM" in 24-hour format if mentioned (e.g. "5 PM" -> "17:00", "noon" -> "12:00"). If not mentioned, null.
16. "estimate_hours": Number of expected or estimated hours spoken (e.g. "expected 4 hours", "estimate 2.5 hours", "3 hours"). Float or integer between 0 and 1000. If not mentioned, null.
17. "priority": One of: "low", "medium", "high", "urgent". Default to "medium". If words like "urgent", "asap", "critical", "top priority" (or Urdu "zaroori", "jaldi") are used, set to "urgent".
18. "checklist": Array of short string checklist items if mentioned (e.g. ["verify numbers", "send email"]). Otherwise empty array.
19. "is_collective": true ONLY if the speaker explicitly asks for a collective task / project / sub-tasks, OR names two or more different people each with their own piece of work under one goal (e.g. "website developer builds the page, content writer writes the copy"). Otherwise false.
20. "subtasks": When "is_collective" is true, one object per piece of work (max {MAX_VOICE_SUBTASKS}), each with "title" (short imperative English, keep spoken quantities), "description" (the work only, same rule as the main description), "assignee_name"/"assignee_id"/"spoken_assignee" (same strict roster rules as the main assignee), "due_date" ("YYYY-MM-DD" or null) and "estimate_hours" (number or null). For a collective task, the main "assignee_*" fields are the team lead who owns the whole task. When "is_collective" is false, return [].

Return ONLY a valid JSON object with these keys:
{{
  "is_task": boolean,
  "title": string,
  "description": string,
  "assignee_name": string or null,
  "assignee_id": string or null,
  "spoken_assignee": string or null,
  "ambiguous_names": [string],
  "watcher_names": [string],
  "watcher_ids": [string],
  "spoken_watchers": [string],
  "company_id": string or null,
  "company_name": string or null,
  "spoken_company": string or null,
  "start_date": string or null,
  "due_date": string or null,
  "due_time": string or null,
  "estimate_hours": number or null,
  "priority": "low" | "medium" | "high" | "urgent",
  "checklist": [string],
  "is_collective": boolean,
  "subtasks": [{{"title": string, "description": string, "assignee_name": string or null, "assignee_id": string or null, "spoken_assignee": string or null, "due_date": string or null, "estimate_hours": number or null}}]
}}"""

    models_to_try = list(DEFAULT_LLM_MODELS)
    content = None
    last_failure = "error"  # "busy" | "timeout" | "error"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=LLM_CALL_TIMEOUT_SECONDS) as client:
        for model_name in models_to_try:
            budget = min(LLM_CALL_TIMEOUT_SECONDS, _remaining(deadline))
            if budget < MIN_CALL_SECONDS:
                last_failure = "timeout"
                break
            payload = {
                "model": model_name,
                "temperature": 0.1,
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {"name": "voice_task", "strict": True, "schema": VOICE_TASK_SCHEMA},
                },
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Voice Command: \"{transcript}\""},
                ],
            }
            try:
                resp = await asyncio.wait_for(
                    client.post(
                        f"{GROQ_BASE_URL}/chat/completions",
                        headers=headers,
                        json=payload,
                        timeout=budget,
                    ),
                    timeout=budget,
                )
            except (asyncio.TimeoutError, httpx.TimeoutException):
                logger.warning("groq_llm_timeout model=%s", model_name)
                last_failure = "timeout"
                continue
            except httpx.RequestError as exc:
                logger.warning("groq_llm_network_error model=%s type=%s", model_name, type(exc).__name__)
                last_failure = "error"
                continue

            if resp.status_code == 200:
                try:
                    content = resp.json()["choices"][0]["message"]["content"]
                except Exception:
                    logger.warning("groq_llm_bad_response model=%s", model_name)
                    last_failure = "error"
                    break
                break

            logger.warning("groq_llm_failed model=%s status=%s", model_name, resp.status_code)
            if not _is_retryable_status(resp.status_code):
                last_failure = "error"
                break
            last_failure = "busy" if resp.status_code == 429 else "error"

    if not content:
        if last_failure == "timeout":
            raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=MSG_TIMEOUT)
        if last_failure == "busy":
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=MSG_BUSY)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=MSG_EXTRACT_FAILED)

    try:
        parsed = json.loads(content)
        if not isinstance(parsed, dict):
            raise ValueError("not an object")
    except Exception:
        logger.warning("groq_llm_bad_json")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=MSG_EXTRACT_FAILED)

    # Guard against non-task speech (random chatter, filler, testing phrases)
    if parsed.get("is_task") is False:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No actionable task detected in speech. Please speak a command like: 'Assign website banner to Hamza by Friday'.",
        )

    # Deterministic post-processing and sanity verification
    assignee_id = parsed.get("assignee_id")
    assignee_name = parsed.get("assignee_name")
    spoken_assignee = parsed.get("spoken_assignee") or assignee_name
    ambiguous_candidates: List[Dict[str, Any]] = []
    unrecognized_assignee: Optional[str] = None
    status_code = "unassigned"

    # Verify or resolve assignee_id against roster
    matched_user = next((u for u in assignable_users if u["id"] == assignee_id), None) if assignee_id else None

    if matched_user:
        status_code = "matched"
        assignee_id = matched_user["id"]
        assignee_name = matched_user["name"]
    elif assignee_name or spoken_assignee:
        lookup_name = assignee_name or spoken_assignee
        candidates = _find_matching_candidates(lookup_name, assignable_users)
        if len(candidates) == 1:
            assignee_id = candidates[0]["id"]
            assignee_name = candidates[0]["name"]
            status_code = "matched"
        elif len(candidates) > 1:
            assignee_id = None
            assignee_name = None  # STRICT: never output raw text
            status_code = "needs_selection"
            ambiguous_candidates = [
                {
                    "id": c["id"],
                    "name": c["name"],
                    "department": c.get("department", ""),
                    "role": c.get("role", ""),
                }
                for c in candidates
            ]
        else:
            assignee_id = None
            assignee_name = None  # STRICT DROPDOWN LOCK: Never keep unrecognized raw text
            status_code = "unassigned"
            if spoken_assignee and str(spoken_assignee).strip():
                unrecognized_assignee = str(spoken_assignee).strip()
    else:
        assignee_id = None
        assignee_name = None
        status_code = "unassigned"

    # The model left the assignee out entirely: use the first assignment phrase in the transcript.
    spoken_people = _spoken_assignees(transcript, assignable_users)
    if status_code == "unassigned" and not unrecognized_assignee and spoken_people:
        assignee_id = spoken_people[0]["id"]
        assignee_name = spoken_people[0]["name"]
        status_code = "matched"

    # Watcher resolution
    raw_watcher_ids = parsed.get("watcher_ids") or []
    raw_watcher_names = parsed.get("watcher_names") or []
    spoken_watchers = parsed.get("spoken_watchers") or []

    final_watcher_ids: List[str] = []
    final_watcher_names: List[str] = []
    unrecognized_watchers: List[str] = []

    # 1. Collect from direct valid watcher_ids from the roster
    for wid in raw_watcher_ids:
        matched_w = next((u for u in assignable_users if u["id"] == wid), None)
        if matched_w:
            if matched_w["id"] != assignee_id and matched_w["id"] not in final_watcher_ids:
                final_watcher_ids.append(matched_w["id"])
                final_watcher_names.append(matched_w["name"])

    # 2. Resolve any watcher names or spoken watchers not yet resolved
    names_to_check = list(raw_watcher_names) + [sw for sw in spoken_watchers if sw not in raw_watcher_names]
    if not raw_watcher_ids and not names_to_check:
        names_to_check = [next(g for g in m.groups() if g) for m in _WATCHER_PHRASES.finditer(transcript)]
    for w_name in names_to_check:
        if not w_name or not str(w_name).strip():
            continue
        # Check if already matched
        if any(str(w_name).strip().lower() == wn.lower() for wn in final_watcher_names):
            continue
        cands = _find_matching_candidates(str(w_name), assignable_users)
        if len(cands) == 1:
            cw = cands[0]
            if cw["id"] != assignee_id and cw["id"] not in final_watcher_ids:
                final_watcher_ids.append(cw["id"])
                final_watcher_names.append(cw["name"])
        elif len(cands) == 0 and _role_people(str(w_name), assignable_users):
            for cw in _role_people(str(w_name), assignable_users):
                if cw["id"] != assignee_id and cw["id"] not in final_watcher_ids:
                    final_watcher_ids.append(cw["id"])
                    final_watcher_names.append(cw["name"])
        elif len(cands) == 0:
            if str(w_name).strip() not in unrecognized_watchers:
                unrecognized_watchers.append(str(w_name).strip())

    # Company resolution
    company_id = parsed.get("company_id")
    company_name = parsed.get("company_name")
    spoken_company = parsed.get("spoken_company") or company_name
    unrecognized_company: Optional[str] = None
    matched_company = None
    if company_id and workspaces:
        matched_company = next((w for w in workspaces if w.get("id") == company_id), None)
    if not matched_company and (company_name or spoken_company) and workspaces:
        lookup_co = company_name or spoken_company
        matched_company = _find_matching_company(lookup_co, workspaces)

    if matched_company:
        company_id = matched_company["id"]
        company_name = matched_company["name"]
    else:
        company_id = None
        company_name = None
        if spoken_company and str(spoken_company).strip():
            unrecognized_company = str(spoken_company).strip()

    # Dates validation
    start_date = parsed.get("start_date")
    if start_date:
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", str(start_date).strip()):
            start_date = None
        else:
            start_date = str(start_date).strip()
    else:
        start_date = None

    due_date = parsed.get("due_date")
    if due_date:
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", str(due_date).strip()):
            due_date = None
        else:
            due_date = str(due_date).strip()
    else:
        due_date = None

    # The model left the deadline out: read a spoken day/time ("saturday 6pm se pehle").
    if not due_date:
        due_date, spoken_time = _spoken_due(transcript, now)
        if due_date and not parsed.get("due_time"):
            parsed["due_time"] = spoken_time

    # Estimate hours validation
    estimate_hours = None
    raw_est = parsed.get("estimate_hours")
    if raw_est is not None:
        try:
            val = float(raw_est)
            if 0 <= val <= 1000:
                estimate_hours = round(val, 2)
        except (ValueError, TypeError):
            estimate_hours = None

    # Normalize priority
    priority = (parsed.get("priority") or "medium").lower()
    if priority not in ("low", "medium", "high", "urgent"):
        priority = "medium"

    # Checklist structure
    raw_checklist = parsed.get("checklist") or []
    checklist_items = [{"text": str(c).strip()} for c in raw_checklist if str(c).strip()]

    subtasks = _collective_from_parse(parsed, transcript, assignable_users)
    # Sub-tasks the model left without any name: the remaining assignment phrases, in order,
    # only when they line up one-to-one with the sub-tasks after the lead.
    if (
        subtasks
        and len(spoken_people) == len(subtasks) + 1
        and spoken_people[0]["id"] == assignee_id
    ):
        for sub, person in zip(subtasks, spoken_people[1:]):
            if sub["assignee_status"] == "unassigned" and not sub["unrecognized_assignee"]:
                sub.update(assignee_id=person["id"], assignee_name=person["name"], assignee_status="matched")

    task_title = (parsed.get("title") or transcript[:100]).strip()
    people: List[Optional[str]] = [assignee_name, spoken_assignee, parsed.get("assignee_name"), *final_watcher_names]
    people += [str(w) for w in (parsed.get("spoken_watchers") or []) + (parsed.get("watcher_names") or [])]
    for raw_sub in parsed.get("subtasks") if isinstance(parsed.get("subtasks"), list) else []:
        if isinstance(raw_sub, dict):
            people += [raw_sub.get("assignee_name"), raw_sub.get("spoken_assignee")]
    for sub in subtasks:
        people.append(sub.get("assignee_name"))
    # Never empty, and never the raw voice command: the title (and sub-task titles) describe the work.
    task_description = _work_description(
        (parsed.get("description") or "").strip(),
        task_title,
        subtasks,
        people,
        has_date=bool(due_date or start_date or parsed.get("due_time")),
    )

    return {
        "transcript": transcript,
        "task": {
            "title": task_title,
            "description": task_description,
            "assignee_id": assignee_id,
            "assignee_name": assignee_name,
            "watcher_ids": final_watcher_ids,
            "watcher_names": final_watcher_names,
            "company_id": company_id,
            "company_name": company_name,
            "start_date": start_date,
            "due_date": due_date,
            "due_time": parsed.get("due_time"),
            "estimate_hours": estimate_hours,
            "priority": priority,
            "checklist": checklist_items,
            "is_collective": bool(subtasks),
            "subtasks": subtasks,
        },
        "confidence": {
            "status": status_code,
            "ambiguous_candidates": ambiguous_candidates,
            "unrecognized_assignee": unrecognized_assignee,
            "unrecognized_company": unrecognized_company,
            "unrecognized_watchers": unrecognized_watchers,
        },
    }


async def parse_voice_task(
    audio_bytes: bytes,
    assignable_users: List[Dict[str, Any]],
    workspaces: Optional[List[Dict[str, Any]]] = None,
    audio_ext: str = "m4a",
    audio_mime: str = "audio/mp4",
    timezone_name: str = "Asia/Karachi",
) -> Dict[str, Any]:
    """End-to-end orchestration: Transcribe audio then extract structured task (one shared deadline)."""
    deadline = _new_deadline()
    transcript = await transcribe_audio(
        audio_bytes=audio_bytes,
        audio_ext=audio_ext,
        audio_mime=audio_mime,
        roster_hint=assignable_users,
        workspace_hint=workspaces,
        deadline=deadline,
    )
    return await extract_task_from_transcript(
        transcript=transcript,
        assignable_users=assignable_users,
        workspaces=workspaces,
        timezone_name=timezone_name,
        deadline=deadline,
    )
