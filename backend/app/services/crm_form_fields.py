"""Map Facebook / Instagram form questions onto CRM brief fields."""
from __future__ import annotations

import re
from typing import Any, Dict, Optional, Set, Tuple

# Lead Ads are stored as facebook or instagram. Routing rules are often saved as meta.
SOCIAL_SOURCES = frozenset({"facebook", "instagram", "meta", "fb", "ig"})

NO_WEBSITE_VALUES = frozenset(
    {
        "no",
        "none",
        "n/a",
        "na",
        "no website",
        "nil",
        "-",
        "null",
        "nothing",
        "i don't have a website",
        "i dont have a website",
        "don't have a website",
        "dont have a website",
        "true",
        "yes",
        "1",
        "on",
    }
)

_ROLE_KEYS = frozenset({"job_title", "role", "your_role", "position", "designation"})
_START_KEYS = frozenset(
    {
        "when_are_you_planning_to_start",
        "start_timeline",
        "timeline",
        "planning_to_start",
        "start",
    }
)
_SERVICE_KEYS = frozenset({"service", "looking_for", "interest", "help_with", "product"})

_LIMITS = {
    "role": 80,
    "budget": 80,
    "start_timeline": 80,
    "service": 120,
    "objective": 200,
}

_ACRONYMS = {"Url": "URL", "Pkr": "PKR", "Whatsapp": "WhatsApp", "Id": "ID"}


def sources_equivalent(actual: str, expected: str) -> bool:
    left = (actual or "").strip().lower()
    right = (expected or "").strip().lower()
    if left == right:
        return True
    return left in SOCIAL_SOURCES and right in SOCIAL_SOURCES


def is_no_website(value: Any) -> bool:
    if isinstance(value, (list, tuple)) and value:
        value = value[0]
    return str(value or "").strip().lower() in NO_WEBSITE_VALUES


def normalize_form_key(key: str) -> str:
    text = str(key or "").lower().replace("?", "")
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return re.sub(r"_+", "_", text).strip("_")


def humanize_form_value(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if "@" in text or text.startswith("+") or re.fullmatch(r"[\d\s().+-]+", text):
        return text
    if "_" not in text and "/" not in text and text != text.lower():
        return text
    spaced = text.replace("_", " ").replace("?", "")
    spaced = re.sub(r"\s*/\s*", " / ", spaced)
    spaced = re.sub(r"\s+", " ", spaced).strip()
    titled = re.sub(r"\b([a-z])", lambda match: match.group(1).upper(), spaced)
    return re.sub(r"\bPkr\b", "PKR", titled)


def humanize_form_key(key: str) -> str:
    words = normalize_form_key(key).replace("_", " ").strip()
    if not words:
        return "Answer"
    titled = re.sub(r"\b([a-z])", lambda match: match.group(1).upper(), words)
    for raw, pretty in _ACRONYMS.items():
        titled = re.sub(rf"\b{raw}\b", pretty, titled)
    return titled


def classify_form_key(key: str) -> Optional[str]:
    normalized = normalize_form_key(key)
    if not normalized:
        return None
    if normalized in _ROLE_KEYS:
        return "role"
    if "budget" in normalized:
        return "budget"
    if normalized in _START_KEYS or "planning_to_start" in normalized:
        return "start_timeline"
    if normalized in _SERVICE_KEYS:
        return "service"
    if "goal" in normalized:
        return "objective"
    return None


def _blank(value: Any) -> bool:
    return value is None or not str(value).strip()


def pull_form_answers(
    custom: Dict[str, Any],
    current: Dict[str, Any],
) -> Tuple[Dict[str, Optional[str]], Set[str]]:
    """Fill empty brief fields from form questions. Return filled fields and consumed keys."""
    filled: Dict[str, Optional[str]] = {name: current.get(name) for name in _LIMITS}
    consumed: Set[str] = set()
    for key, raw in (custom or {}).items():
        target = classify_form_key(str(key))
        if not target or not _blank(filled.get(target)):
            continue
        text = humanize_form_value(raw)
        if not text:
            continue
        filled[target] = text[: _LIMITS[target]]
        consumed.add(str(key))
    return filled, consumed


def form_answer_rows(custom: Dict[str, Any], consumed: Set[str]) -> list:
    rows = []
    for key, raw in (custom or {}).items():
        if str(key) in consumed:
            continue
        value = humanize_form_value(raw)
        if not value:
            continue
        rows.append({"label": humanize_form_key(str(key)), "value": value[:500]})
    return rows
