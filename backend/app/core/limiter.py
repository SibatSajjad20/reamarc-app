"""Shared SlowAPI limiter for the whole FastAPI app."""
from slowapi import Limiter
from starlette.requests import Request
from slowapi.util import get_remote_address

from app.services.attendance_security import trusted_proxy_client_ip


def get_client_ip(request: Request) -> str:
    """Rate-limit key: trusted proxy client IP (right-most public XFF hop)."""
    socket_ip = request.client.host if request.client and request.client.host else None
    forwarded = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
    trusted = trusted_proxy_client_ip(socket_ip, forwarded)
    if trusted:
        return trusted
    return get_remote_address(request)


limiter = Limiter(key_func=get_client_ip)
