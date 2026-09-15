"""Normalize messy CRM / Meta phone strings into E.164 without a plus sign.

wa.me requires digits only, e.g. 923001234567. Default country is Pakistan.
"""
from __future__ import annotations

import re
from typing import Optional, Tuple

_NON_DIGITS = re.compile(r"\D+")


def digits_only(raw: Optional[str]) -> str:
    if not raw:
        return ""
    return _NON_DIGITS.sub("", str(raw))


def normalize_phone_e164(raw: Optional[str], default_region: str = "PK") -> Tuple[Optional[str], bool]:
    """Return (e164_without_plus, is_valid).

    Accepts forms like 0300-123-4567, +92 300 1234567, 00923001234567, 3001234567.
    Invalid input still returns (None, False) so the lead can be saved without a WhatsApp CTA.
    """
    digits = digits_only(raw)
    if not digits:
        return None, False

    if digits.startswith("00"):
        digits = digits[2:]

    if default_region.upper() == "PK":
        if digits.startswith("92"):
            e164 = digits
        elif digits.startswith("0") and len(digits) >= 10:
            e164 = "92" + digits[1:]
        elif len(digits) == 10 and digits.startswith("3"):
            e164 = "92" + digits
        else:
            e164 = digits if 10 <= len(digits) <= 15 else None
            return e164, bool(e164 and 10 <= len(e164) <= 15)

        valid = e164.startswith("92") and 11 <= len(e164) <= 13
        return e164, valid

    if 10 <= len(digits) <= 15:
        return digits, True
    return None, False


def wa_me_url(e164: Optional[str], text: Optional[str] = None) -> Optional[str]:
    if not e164:
        return None
    url = f"https://wa.me/{e164}"
    if text:
        from urllib.parse import quote

        url += f"?text={quote(text)}"
    return url
