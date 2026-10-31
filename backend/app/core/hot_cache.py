"""Short-lived, tenant-keyed in-process caches. Never store secrets."""
from __future__ import annotations

import time
from typing import Any, Optional

_MATRIX_TTL_SECONDS = 45.0
_matrix_cache: dict[tuple[str, str, str], tuple[float, Any]] = {}


def matrix_cache_key(company_id: Optional[str], date_str: str, department: Optional[str]) -> tuple[str, str, str]:
    cid = company_id or "unknown"
    dept = (department or "all").strip().lower() or "all"
    return (cid, date_str, dept)


def get_cached_matrix(company_id: Optional[str], date_str: str, department: Optional[str]) -> Any | None:
    key = matrix_cache_key(company_id, date_str, department)
    entry = _matrix_cache.get(key)
    if not entry:
        return None
    expires_at, payload = entry
    if time.monotonic() >= expires_at:
        _matrix_cache.pop(key, None)
        return None
    return payload


def set_cached_matrix(company_id: Optional[str], date_str: str, department: Optional[str], payload: Any) -> None:
    key = matrix_cache_key(company_id, date_str, department)
    _matrix_cache[key] = (time.monotonic() + _MATRIX_TTL_SECONDS, payload)


def clear_matrix_cache(company_id: Optional[str] = None) -> None:
    if company_id is None:
        _matrix_cache.clear()
        return
    for key in [k for k in _matrix_cache if k[0] == company_id]:
        _matrix_cache.pop(key, None)
