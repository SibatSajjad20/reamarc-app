"""Shared SlowAPI limiter for the whole FastAPI app."""
from slowapi import Limiter
from starlette.requests import Request
from slowapi.util import get_remote_address


def get_client_ip(request: Request) -> str:
    """Prefer the leftmost X-Forwarded-For hop (Render / reverse proxies)."""
    forwarded = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip() or get_remote_address(request)
    return get_remote_address(request)


limiter = Limiter(key_func=get_client_ip)
