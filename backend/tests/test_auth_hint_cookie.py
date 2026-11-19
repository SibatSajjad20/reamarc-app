"""wl_auth_hint: a readable, non-secret 'signed in / signed out' hint next to the HttpOnly session cookies."""
import os
import sys

os.environ.setdefault("SECRET_KEY", "test-secret-key-auth-hint-0123456789abcdef")
os.environ["RUN_SCHEDULERS"] = "0"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from starlette.responses import Response

from app.routers.auth import AUTH_HINT_COOKIE, _clear_auth_cookies, _set_auth_cookies


def _cookies(resp: Response) -> list[str]:
    return [v.decode() for k, v in resp.raw_headers if k.decode().lower() == "set-cookie"]


def test_login_sets_readable_hint_and_keeps_tokens_httponly():
    resp = Response()
    _set_auth_cookies(resp, "access-value", "refresh-value", None)
    headers = _cookies(resp)
    access = next(h for h in headers if h.startswith("access_token="))
    refresh = next(h for h in headers if h.startswith("refresh_token="))
    hint = [h for h in headers if h.startswith(f"{AUTH_HINT_COOKIE}=")]
    assert "httponly" in access.lower() and "httponly" in refresh.lower()
    assert len(hint) == 1 and hint[0].startswith(f"{AUTH_HINT_COOKIE}=1;")
    assert "httponly" not in hint[0].lower()
    # The hint carries no token material.
    assert "access-value" not in hint[0] and "refresh-value" not in hint[0]


def test_logout_leaves_signed_out_hint_last():
    resp = Response()
    _clear_auth_cookies(resp, None)
    hint = [h for h in _cookies(resp) if h.startswith(f"{AUTH_HINT_COOKIE}=")]
    assert hint, "logout must touch the hint cookie"
    # Browsers apply Set-Cookie in order: the final one must be the signed-out value.
    assert hint[-1].startswith(f"{AUTH_HINT_COOKIE}=0;")
    assert "httponly" not in hint[-1].lower()
    assert "max-age=0" not in hint[-1].lower()
