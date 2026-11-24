"""Voice Task Service for transcribing voice commands and extracting structured task proposals."""
from __future__ import annotations

import json
import logging
import re
import difflib
from datetime import datetime
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

import httpx
from fastapi import HTTPException, status

from app.config import Settings

logger = logging.getLogger("app.services.voice_task")

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
WHISPER_MODEL = "whisper-large-v3-turbo"
DEFAULT_LLM_MODELS = [
    "openai/gpt-oss-120b",
    "llama-3.3-70b-versatile",
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-20b",
]


def _get_groq_api_key() -> str:
    # 1. Check global settings instance from app.config
    try:
        from app.config import settings
        key = (settings.GROQ_API_KEY or "").strip()
        if key:
            return key
    except Exception:
        pass

    # 2. Check os.environ
    import os
    env_key = os.getenv("GROQ_API_KEY", "").strip()
    if env_key:
        return env_key

    # 3. Direct inspection of .env files across possible working directories
    for env_path in [".env", "backend/.env", "../backend/.env", "../.env"]:
        if os.path.exists(env_path):
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        clean = line.strip()
                        if clean.startswith("GROQ_API_KEY="):
                            val = clean.split("=", 1)[1].strip().strip('"').strip("'")
                            if val:
                                return val
            except Exception:
                pass

    return ""


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


async def transcribe_audio(
    audio_bytes: bytes,
    filename: str = "audio.m4a",
    content_type: str = "audio/m4a",
    roster_hint: Optional[List[Dict[str, Any]]] = None,
    workspace_hint: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """Transcribe voice audio to text using Groq Whisper Large v3 Turbo."""
    if not audio_bytes or len(audio_bytes) < 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio recording is empty or too short. Please speak clearly and try again.",
        )

    api_key = _get_groq_api_key()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Voice service is not configured (missing GROQ_API_KEY).",
        )

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

    files = {
        "file": (filename, audio_bytes, content_type or "audio/m4a"),
    }
    data = {
        "model": WHISPER_MODEL,
        "response_format": "json",
        "temperature": "0.0",
        "prompt": prompt_str,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{GROQ_BASE_URL}/audio/transcriptions",
                headers=headers,
                files=files,
                data=data,
            )
    except httpx.RequestError as exc:
        logger.error(f"Network error calling Groq Whisper: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to connect to voice transcription service. Please try again.",
        ) from exc

    if resp.status_code != 200:
        logger.error(f"Groq Whisper returned {resp.status_code}: {resp.text}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Voice transcription failed: {resp.text[:200]}",
        )

    result = resp.json()
    transcript = (result.get("text") or "").strip()
    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No intelligible speech detected. Please speak closer to the microphone and try again.",
        )

    return transcript


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

        # 2. Word boundary / First name or Last name match
        if any(st == ut for st in core_spoken for ut in core_uname):
            if set(core_spoken).issubset(set(core_uname)) or set(core_uname).issubset(set(core_spoken)):
                exact_matches.append(u)
                continue
            else:
                token_matches.append(u)
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


async def extract_task_from_transcript(
    transcript: str,
    assignable_users: List[Dict[str, Any]],
    workspaces: Optional[List[Dict[str, Any]]] = None,
    timezone_name: str = "Asia/Karachi",
) -> Dict[str, Any]:
    """Parse a voice transcript into structured task fields using Groq LLaMA 3.3 70B."""
    api_key = _get_groq_api_key()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Voice service is not configured (missing GROQ_API_KEY).",
        )

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
{json.dumps(compact_roster, indent=2)}

Active Companies / Workspaces:
{json.dumps(compact_workspaces, indent=2)}

CRITICAL RULES FOR EXTRACTION:
0. "is_task": boolean. Set to true if the voice command is a genuine instruction or request to create, assign, or track a task. Set to false if the speech is casual conversational talk (e.g. "how are you", "what's the weather today"), testing phrases ("hello testing 1 2 3", "mic check"), random chatter, or questions with no actionable task intent.
1. "title": Short, imperative, professional summary of the task in English (e.g. "Design social media banners", "Review financial audit"). Max 200 chars. Required. If the voice command was in Urdu, translate the action into a concise professional English title.
2. "description": A clear, comprehensive, and professional task description detailing what needs to be done based on the spoken instruction. Capture the objective, scope, requirements, context, and any specific notes or instructions spoken. ALWAYS generate an informative task description in clear English (if spoken in Urdu or Roman Urdu, translate and articulate clearly in professional English). NEVER leave description empty or blank.
3. "assignee_name": MUST be chosen STRICTLY from the names in the "Active Company Team Roster" above if a matching employee is mentioned.
   - NEVER invent, guess, or output any name outside this roster.
   - If the spoken person cannot be found in the roster, output null.
4. "assignee_id": If the spoken name matches a person in the roster (taking into account Urdu/Pakistani spelling variations like Mohammad/Muhammad, Usman/Osman, Hamza/Humza, or department hints like "Hamza from design"), output their exact "id" from the roster.
   - If ambiguous (multiple people in the roster match) or if NO ONE in the roster matches, set to null.
5. "spoken_assignee": Raw name of any person spoken or mentioned for the task (e.g. "Junaid", "John"), or null if no person was mentioned.
6. "ambiguous_names": If multiple people from the roster match the spoken name (e.g. "Hamza" when there are 2 Hamzas), list their names. Otherwise empty array.
7. "company_id": If a client or company from the "Active Companies / Workspaces" list is mentioned (e.g. "for Acme", "company Alpha"), output their exact "id". Otherwise null.
8. "company_name": Exact "name" from the "Active Companies / Workspaces" list corresponding to "company_id", or null.
9. "spoken_company": Raw name of any client or company spoken in the command (e.g. "Tesla", "Acme"), or null if no company was mentioned.
10. "start_date": Absolute start date string in "YYYY-MM-DD" format if mentioned (e.g. "starts tomorrow", "starting today", "from Friday"). If not mentioned, null.
11. "due_date": Absolute date string in "YYYY-MM-DD" format if mentioned (e.g. "today", "tomorrow", "this Friday", "by next Monday"). If not mentioned, null.
12. "due_time": "HH:MM" in 24-hour format if mentioned (e.g. "5 PM" -> "17:00", "noon" -> "12:00"). If not mentioned, null.
13. "estimate_hours": Number of expected or estimated hours spoken (e.g. "expected 4 hours", "estimate 2.5 hours", "3 hours"). Float or integer between 0 and 1000. If not mentioned, null.
14. "priority": One of: "low", "medium", "high", "urgent". Default to "medium". If words like "urgent", "asap", "critical", "top priority" (or Urdu "zaroori", "jaldi") are used, set to "urgent".
15. "checklist": Array of short string checklist items if mentioned (e.g. ["verify numbers", "send email"]). Otherwise empty array.

Return ONLY a valid JSON object with these keys:
{{
  "is_task": boolean,
  "title": string,
  "description": string,
  "assignee_name": string or null,
  "assignee_id": string or null,
  "spoken_assignee": string or null,
  "ambiguous_names": [string],
  "company_id": string or null,
  "company_name": string or null,
  "spoken_company": string or null,
  "start_date": string or null,
  "due_date": string or null,
  "due_time": string or null,
  "estimate_hours": number or null,
  "priority": "low" | "medium" | "high" | "urgent",
  "checklist": [string]
}}"""

    models_to_try = list(DEFAULT_LLM_MODELS)
    last_error_text = ""
    content = None
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        for model_name in models_to_try:
            payload = {
                "model": model_name,
                "temperature": 0.1,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Voice Command: \"{transcript}\""},
                ],
            }
            try:
                resp = await client.post(
                    f"{GROQ_BASE_URL}/chat/completions",
                    headers=headers,
                    json=payload,
                )
                if resp.status_code == 200:
                    content = resp.json()["choices"][0]["message"]["content"]
                    break
                else:
                    last_error_text = resp.text
                    logger.warning(f"Groq model {model_name} failed ({resp.status_code}): {resp.text[:100]}")
            except httpx.RequestError as exc:
                last_error_text = str(exc)
                logger.warning(f"Groq model {model_name} network error: {exc}")

    if not content:
        logger.error(f"All Groq LLM candidate models failed: {last_error_text}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Task extraction failed: {last_error_text[:200]}",
        )

    try:
        parsed = json.loads(content)
    except Exception as exc:
        logger.error(f"Failed to parse LLM JSON: {exc}")
        parsed = {
            "title": transcript[:100],
            "description": transcript,
            "assignee_id": None,
            "assignee_name": None,
            "ambiguous_names": [],
            "company_id": None,
            "company_name": None,
            "start_date": None,
            "due_date": None,
            "due_time": None,
            "estimate_hours": None,
            "priority": "medium",
            "checklist": [],
        }

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

    task_title = (parsed.get("title") or transcript[:100]).strip()
    task_description = (parsed.get("description") or "").strip()
    if not task_description:
        # Guarantee that task description is always entered and never empty
        task_description = transcript.strip() if transcript.strip() else task_title

    return {
        "transcript": transcript,
        "task": {
            "title": task_title,
            "description": task_description,
            "assignee_id": assignee_id,
            "assignee_name": assignee_name,
            "company_id": company_id,
            "company_name": company_name,
            "start_date": start_date,
            "due_date": due_date,
            "due_time": parsed.get("due_time"),
            "estimate_hours": estimate_hours,
            "priority": priority,
            "checklist": checklist_items,
        },
        "confidence": {
            "status": status_code,
            "ambiguous_candidates": ambiguous_candidates,
            "unrecognized_assignee": unrecognized_assignee,
            "unrecognized_company": unrecognized_company,
        },
    }


async def parse_voice_task(
    audio_bytes: bytes,
    assignable_users: List[Dict[str, Any]],
    workspaces: Optional[List[Dict[str, Any]]] = None,
    filename: str = "audio.m4a",
    content_type: str = "audio/m4a",
    timezone_name: str = "Asia/Karachi",
) -> Dict[str, Any]:
    """End-to-end orchestration: Transcribe audio then extract structured task."""
    transcript = await transcribe_audio(
        audio_bytes=audio_bytes,
        filename=filename,
        content_type=content_type,
        roster_hint=assignable_users,
        workspace_hint=workspaces,
    )
    return await extract_task_from_transcript(
        transcript=transcript,
        assignable_users=assignable_users,
        workspaces=workspaces,
        timezone_name=timezone_name,
    )
