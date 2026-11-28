"""Route-contract test: every API path called by web/mobile services must exist in FastAPI."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

from fastapi.routing import APIRoute

from app.main import app


REPO_ROOT = Path(__file__).resolve().parent.parent
API_PREFIX = "/api/v1"

_METHOD_MAP = {
    "get": "GET",
    "getBlob": "GET",
    "post": "POST",
    "upload": "POST",
    "put": "PUT",
    "patch": "PATCH",
    "delete": "DELETE",
}

# Known pre-existing uncalled legacy client method / fallback probes on main:
_KNOWN_ALLOWLIST: Set[Tuple[str, str]] = {
    ("GET", "/api/v1/owner/audit/verify"),  # uncalled legacy method ownerService.verifyAuditChain
    ("GET", "/api/v1/users"),  # fallback probe inside mobile/src/lib/tasks.ts:firstPeople
}


def _walk_routes(
    route_list, prefix: str = "", out: Optional[Set[Tuple[str, str]]] = None
) -> Set[Tuple[str, str]]:
    if out is None:
        out = set()
    for route in route_list:
        if isinstance(route, APIRoute):
            full_path = prefix + route.path
            norm = re.sub(r"\{[^}]+\}", "{}", full_path)
            for method in route.methods or ():
                out.add((method.upper(), norm))
        elif hasattr(route, "original_router"):
            ctx_prefix = getattr(getattr(route, "include_context", None), "prefix", "") or ""
            _walk_routes(route.original_router.routes, prefix + ctx_prefix, out)
        elif hasattr(route, "routes"):
            sub_prefix = getattr(route, "prefix", "") or ""
            _walk_routes(route.routes, prefix + sub_prefix, out)
    return out


def _backend_routes() -> Set[Tuple[str, str]]:
    """Return all (METHOD, normalized_path) pairs mounted on the FastAPI app."""
    return _walk_routes(app.routes)


def _route_matches(candidate: str, backend_pattern: str) -> bool:
    """Match normalized client path against normalized FastAPI route pattern."""
    if candidate == backend_pattern:
        return True
    c_parts = candidate.strip("/").split("/")
    b_parts = backend_pattern.strip("/").split("/")
    if len(c_parts) != len(b_parts):
        return False
    return all(bp == "{}" or cp == bp for cp, bp in zip(c_parts, b_parts))


def _strip_ts_comments(source: str) -> str:
    """Remove // and /* */ comments while keeping string literals intact."""
    out: List[str] = []
    i = 0
    n = len(source)
    in_str: Optional[str] = None
    while i < n:
        ch = source[i]
        if in_str:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(source[i + 1])
                i += 2
                continue
            if ch == in_str:
                in_str = None
            i += 1
            continue
        if ch in ("'", '"', "`"):
            in_str = ch
            out.append(ch)
            i += 1
            continue
        if ch == "/" and i + 1 < n and source[i + 1] == "/":
            end = source.find("\n", i)
            if end == -1:
                break
            i = end
            continue
        if ch == "/" and i + 1 < n and source[i + 1] == "*":
            end = source.find("*/", i + 2)
            if end == -1:
                break
            i = end + 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def _find_call_open_paren(text: str, pos: int) -> Optional[int]:
    """From just after method name, skip whitespace and optional <...> generic args to '('."""
    n = len(text)
    while pos < n and text[pos].isspace():
        pos += 1
    if pos < n and text[pos] == "<":
        depth = 0
        in_str: Optional[str] = None
        while pos < n:
            ch = text[pos]
            if in_str:
                if ch == "\\" and pos + 1 < n:
                    pos += 2
                    continue
                if ch == in_str:
                    in_str = None
            else:
                if ch in ("'", '"', "`"):
                    in_str = ch
                elif ch == "<":
                    depth += 1
                elif ch == ">":
                    if pos > 0 and text[pos - 1] == "=":
                        pos += 1
                        continue
                    depth -= 1
                    if depth == 0:
                        pos += 1
                        break
            pos += 1
        while pos < n and text[pos].isspace():
            pos += 1
    if pos < n and text[pos] == "(":
        return pos
    return None


def _extract_balanced_call(text: str, open_paren: int) -> Tuple[str, int]:
    """Return inner argument text inside (...) and index after closing ')'."""
    depth = 0
    i = open_paren
    n = len(text)
    in_str: Optional[str] = None
    tpl_brace_depth = 0
    while i < n:
        ch = text[i]
        if in_str:
            if ch == "\\" and i + 1 < n:
                i += 2
                continue
            if in_str == "`":
                if ch == "$" and i + 1 < n and text[i + 1] == "{":
                    tpl_brace_depth += 1
                    i += 2
                    continue
                if tpl_brace_depth > 0:
                    if ch == "{":
                        tpl_brace_depth += 1
                    elif ch == "}":
                        tpl_brace_depth -= 1
                    i += 1
                    continue
            if ch == in_str:
                in_str = None
        else:
            if ch in ("'", '"', "`"):
                in_str = ch
            elif ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    return text[open_paren + 1 : i], i + 1
        i += 1
    return text[open_paren + 1 :], n


def _extract_first_string_literal(arg_text: str) -> Optional[str]:
    """Return the first quoted/backticked string literal in arg_text if it starts with it."""
    s = arg_text.lstrip()
    if not s or s[0] not in ("'", '"', "`"):
        return None
    quote = s[0]
    i = 1
    n = len(s)
    tpl_depth = 0
    while i < n:
        ch = s[i]
        if ch == "\\" and i + 1 < n:
            i += 2
            continue
        if quote == "`":
            if ch == "$" and i + 1 < n and s[i + 1] == "{":
                tpl_depth += 1
                i += 2
                continue
            if tpl_depth > 0:
                if ch == "{":
                    tpl_depth += 1
                elif ch == "}":
                    tpl_depth -= 1
                i += 1
                continue
        if ch == quote:
            return s[1:i]
        i += 1
    return None


def _replace_balanced_interpolations(raw: str) -> str:
    """Replace ${...} expressions safely (handling nested braces and '?' inside ternaries)."""
    out: List[str] = []
    i = 0
    n = len(raw)
    while i < n:
        if raw[i] == "$" and i + 1 < n and raw[i + 1] == "{":
            prev_ch = out[-1] if out else ""
            depth = 1
            j = i + 2
            in_q: Optional[str] = None
            while j < n and depth > 0:
                c = raw[j]
                if in_q:
                    if c == "\\" and j + 1 < n:
                        j += 2
                        continue
                    if c == in_q:
                        in_q = None
                else:
                    if c in ("'", '"', "`"):
                        in_q = c
                    elif c == "{":
                        depth += 1
                    elif c == "}":
                        depth -= 1
                j += 1
            # Only treat ${...} directly after '/' as a path parameter; trailing suffixes
            # attached to a literal segment (e.g. /deals${qs ? `?${qs}` : ''}) are query strings.
            if prev_ch == "/":
                out.append("{}")
            elif j < n and raw[j] == "/":
                out.append("{}")
            i = j
            continue
        out.append(raw[i])
        i += 1
    return "".join(out)


def _normalize_endpoint(raw: str) -> Optional[str]:
    """Normalize a client path template into a FastAPI route pattern."""
    path = raw.strip()
    if path.startswith("${API_URL}"):
        path = path[len("${API_URL}") :]
    elif path.startswith("${this.baseUrl}"):
        path = path[len("${this.baseUrl}") :]
    elif path.startswith("http://") or path.startswith("https://"):
        return None

    if not path.startswith("/"):
        return None

    path = _replace_balanced_interpolations(path)
    path = path.split("?", 1)[0]
    parts = [("{}" if "{}" in seg else seg) for seg in path.split("/")]
    path = "/".join(parts)
    path = re.sub(r"/+", "/", path).rstrip("/") or "/"

    if not path.startswith(API_PREFIX):
        path = f"{API_PREFIX}{path}"
    return path


def _collect_web_calls() -> List[Tuple[str, Optional[str], str]]:
    """Collect (file, HTTP_METHOD|None, normalized_path) from src/services/*.ts."""
    calls: List[Tuple[str, Optional[str], str]] = []
    services_dir = REPO_ROOT / "src" / "services"
    pattern = re.compile(
        r"\bapiClient\.(get|post|put|patch|delete|upload|getBlob|requestWithHeaders|request)\b"
    )
    for ts_file in sorted(services_dir.glob("*.ts")):
        if ts_file.name == "apiClient.ts":
            continue
        text = _strip_ts_comments(ts_file.read_text(encoding="utf-8"))
        for match in pattern.finditer(text):
            fn_name = match.group(1)
            open_paren = _find_call_open_paren(text, match.end())
            if open_paren is None:
                continue
            inner, _ = _extract_balanced_call(text, open_paren)
            raw_path = _extract_first_string_literal(inner)
            if not raw_path:
                continue
            norm = _normalize_endpoint(raw_path)
            if not norm:
                continue
            http_method = _METHOD_MAP.get(fn_name)
            if http_method is None:
                m_opt = re.search(r"method\s*:\s*['\"]([A-Za-z]+)['\"]", inner)
                http_method = m_opt.group(1).upper() if m_opt else "GET"
            calls.append((ts_file.relative_to(REPO_ROOT).as_posix(), http_method, norm))

    api_client = services_dir / "apiClient.ts"
    api_text = _strip_ts_comments(api_client.read_text(encoding="utf-8"))
    for match in re.finditer(r"fetch\s*\(\s*`\$\{this\.baseUrl\}([^`]+)`", api_text):
        norm = _normalize_endpoint(match.group(1))
        if norm and "{}" not in norm.split("/")[-1]:
            calls.append((api_client.relative_to(REPO_ROOT).as_posix(), None, norm))
    return calls


def _collect_mobile_calls() -> List[Tuple[str, Optional[str], str]]:
    """Collect (file, HTTP_METHOD|None, normalized_path) from mobile/."""
    calls: List[Tuple[str, Optional[str], str]] = []
    mobile_dirs = [REPO_ROOT / "mobile" / "src", REPO_ROOT / "mobile" / "app"]
    api_pat = re.compile(r"\bapi\s*(?=<|\()")
    fetch_pat = re.compile(r"\bfetch\s*\(\s*`\$\{API_URL\}([^`]+)`")

    for base_dir in mobile_dirs:
        if not base_dir.exists():
            continue
        for ts_file in sorted(base_dir.rglob("*.ts*")):
            if ".test." in ts_file.name:
                continue
            text = _strip_ts_comments(ts_file.read_text(encoding="utf-8"))
            rel = ts_file.relative_to(REPO_ROOT).as_posix()

            for match in api_pat.finditer(text):
                if match.start() > 0 and (
                    text[match.start() - 1].isalnum() or text[match.start() - 1] in (".", "_")
                ):
                    continue
                open_paren = _find_call_open_paren(text, match.end())
                if open_paren is None:
                    continue
                inner, _ = _extract_balanced_call(text, open_paren)
                raw_path = _extract_first_string_literal(inner)
                if not raw_path:
                    continue
                norm = _normalize_endpoint(raw_path)
                if not norm:
                    continue
                m_opt = re.search(r"method\s*:\s*['\"]([A-Za-z]+)['\"]", inner)
                http_method = m_opt.group(1).upper() if m_opt else "GET"
                calls.append((rel, http_method, norm))

            for match in fetch_pat.finditer(text):
                norm = _normalize_endpoint(match.group(1))
                if norm:
                    calls.append((rel, None, norm))

            for match in re.finditer(r"\bfirstPeople\s*\(\s*\[([^\]]+)\]", text):
                for s_match in re.finditer(r"['\"](/[^'\"]+)['\"]", match.group(1)):
                    norm = _normalize_endpoint(s_match.group(1))
                    if norm:
                        calls.append((rel, "GET", norm))
    return calls


def test_all_web_and_mobile_service_routes_exist_in_fastapi() -> None:
    """Every API path called by src/services and mobile/ must match a FastAPI route."""
    routes = _backend_routes()
    routes_by_method: Dict[str, List[str]] = {}
    all_route_paths: List[str] = []
    for method, path in routes:
        routes_by_method.setdefault(method, []).append(path)
        all_route_paths.append(path)

    web_calls = _collect_web_calls()
    mobile_calls = _collect_mobile_calls()
    all_calls = web_calls + mobile_calls

    extracted_pairs = {(m, p) for _, m, p in all_calls if m}
    assert ("POST", "/api/v1/auth/reset-password") in extracted_pairs
    assert ("PATCH", "/api/v1/admin/members/{}") in extracted_pairs
    assert ("POST", "/api/v1/owner/members/{}/starting-password") in extracted_pairs

    missing: List[str] = []
    for rel_file, method, norm_path in all_calls:
        if method and (method, norm_path) in _KNOWN_ALLOWLIST:
            continue
        if method is None:
            if not any(_route_matches(norm_path, bp) for bp in all_route_paths):
                missing.append(f"{rel_file}: ANY {norm_path}")
        else:
            candidates = routes_by_method.get(method, [])
            if not any(_route_matches(norm_path, bp) for bp in candidates):
                missing.append(f"{rel_file}: {method} {norm_path}")

    assert not missing, (
        "Frontend/mobile calls missing from FastAPI routes:\n" + "\n".join(sorted(set(missing)))
    )
