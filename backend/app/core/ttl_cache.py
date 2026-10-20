"""Process-local TTL cache for hot config reads (shifts, system_config)."""
from __future__ import annotations

import time
from typing import Any, Dict, Optional, Tuple

_STORE: Dict[str, Tuple[float, Any]] = {}


def cache_get(key: str) -> Any:
    item = _STORE.get(key)
    if item is None:
        return None
    expires_at, value = item
    if expires_at < time.monotonic():
        _STORE.pop(key, None)
        return None
    return value


def cache_set(key: str, value: Any, ttl_seconds: float = 60.0) -> None:
    _STORE[key] = (time.monotonic() + ttl_seconds, value)


def cache_clear(prefix: Optional[str] = None) -> None:
    if prefix is None:
        _STORE.clear()
        return
    for key in [k for k in _STORE if k.startswith(prefix)]:
        _STORE.pop(key, None)
