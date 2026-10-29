import logging
import json
import os
from datetime import datetime, timezone
from fastapi import FastAPI, Request, Query, Depends
from fastapi.responses import JSONResponse
import re
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.config import settings
from app.core.limiter import limiter
from app.core.uploads import open_upload_response, authorize_stored_upload
from app.core.security import require_internal_user, get_current_user
from app.database import connect_to_mongo, close_mongo_connection, get_database
from app.routers import auth, admin, workspaces, marketing, daily_log, shifts, attendance, leaves, company_calendar, log_exceptions, mobile, crm, crm_approvals, crm_public, web_push, content_calendar, website_projects, users, dashboard, access, owner, company, drive, finance, worklane_public

_SECRET_QUERY_RE = re.compile(
    r'(?i)((?:access_token|client_secret|fb_exchange_token|appsecret_proof|refresh_token|key)=)[^&\s"\']+'
)


class RedactSecretQueryFilter(logging.Filter):
    """Strip OAuth/API secrets from log messages and interpolation args."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = _SECRET_QUERY_RE.sub(r"\1[REDACTED]", record.msg)
        args = record.args
        if args:
            if isinstance(args, dict):
                record.args = {
                    k: _SECRET_QUERY_RE.sub(r"\1[REDACTED]", v) if isinstance(v, str) else v
                    for k, v in args.items()
                }
            else:
                try:
                    record.args = tuple(
                        _SECRET_QUERY_RE.sub(r"\1[REDACTED]", a) if isinstance(a, str) else a
                        for a in args
                    )
                except TypeError:
                    pass
        return True


class JSONFormatter(logging.Formatter):
    """Format log entries as structured JSON lines for production log aggregators."""
    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry)

def setup_logging():
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    handler.addFilter(RedactSecretQueryFilter())
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.handlers = [handler]
    for name in ("httpx", "httpcore", "urllib3", "hpack"):
        logging.getLogger(name).setLevel(logging.WARNING)

setup_logging()

import asyncio

@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()

    # Run data initializations and migrations in background so uvicorn binds to $PORT immediately
    async def _run_startup_cleanup():
        db = get_database()
        if db is None:
            return

        # Optional guarded epoch cleanup (only if explicitly enabled via environment)
        import os
        if os.getenv("RUN_EPOCH_CLEANUP", "").lower() in ("true", "1"):
            try:
                await db.daily_log_entries.delete_many({"date": {"$lt": "2026-08-19"}})
                await db.daily_logs.delete_many({"date": {"$lt": "2026-08-19"}})
                from app.services.attendance_golive import purge_pre_go_live_attendance
                await purge_pre_go_live_attendance()
                logging.getLogger(__name__).info("Explicit epoch log purge completed.")
            except Exception as epoch_err:
                logging.getLogger(__name__).warning(f"Epoch log purge warning: {epoch_err}")

        # Persist any leftover on-disk uploads into Mongo GridFS (survives Render redeploys)
        try:
            from app.core.uploads import migrate_disk_uploads_to_gridfs
            await migrate_disk_uploads_to_gridfs(db)
        except Exception as upload_err:
            logging.getLogger(__name__).warning(f"Uploads migration warning: {upload_err}")

        # Ensure content calendar indexes
        try:
            from app.services.content_calendar_service import ensure_indexes
            await ensure_indexes(db)
        except Exception as idx_err:
            logging.getLogger(__name__).warning(f"Content calendar indexes warning: {idx_err}")

        # Ensure finance indexes
        try:
            from app.services.finance_settings import ensure_finance_indexes
            await ensure_finance_indexes(db)
        except Exception as fin_idx_err:
            logging.getLogger(__name__).warning(f"Finance indexes warning: {fin_idx_err}")

        # Backfill primary_department only. Role rules are fixed in code.
        try:
            from app.services.permissions_migration import (
                backfill_primary_departments,
                normalize_operations_role_labels,
            )
            from app.services.access_migration import run_access_settings_migration
            from app.services.content_calendar_service import backfill_share_tokens
            from app.core.tenant import for_each_active_company

            if os.getenv("RUN_STARTUP_MIGRATIONS", "0") == "1":
                if getattr(settings, "MULTI_TENANT_ENABLED", False):
                    async def _startup_for_company(company):
                        await backfill_primary_departments(db)
                        await normalize_operations_role_labels(db)
                        await run_access_settings_migration(db)
                        await backfill_share_tokens(db)

                    await for_each_active_company(_startup_for_company)
                else:
                    await backfill_primary_departments(db)
                    await normalize_operations_role_labels(db)
                    await run_access_settings_migration(db)
                    await backfill_share_tokens(db)
        except Exception as perm_err:
            logging.getLogger(__name__).exception(f"Primary department / access migration failed: {perm_err}")

    cleanup_task = asyncio.create_task(_run_startup_cleanup())

    run_schedulers = os.getenv("RUN_SCHEDULERS", "1") != "0"
    reminder_task = sla_task = lead_queue_task = meta_poll_task = None
    meeting_reminder_task = website_scheduler_task = sync_task = None
    drive_share_task = None

    if run_schedulers:
        # Start 6-hour background sync task for performance marketing
        async def periodic_marketing_sync():
            while True:
                try:
                    # Sleep 6 hours (21600 seconds) between runs
                    await asyncio.sleep(21600)
                    from app.core.job_locks import job_lease
                    from app.core.tenant import for_each_active_company
                    from app.services.marketing_sync import run_daily_ad_metrics_sync

                    async with job_lease("marketing_metrics_sync", ttl_seconds=1800) as acquired:
                        if acquired:
                            if getattr(settings, "MULTI_TENANT_ENABLED", False):
                                await for_each_active_company(lambda comp: run_daily_ad_metrics_sync())
                            else:
                                await run_daily_ad_metrics_sync()
                except asyncio.CancelledError:
                    break
                except Exception as err:
                    logging.getLogger(__name__).error(f"Error in periodic marketing sync loop: {err}")

        from app.services.attendance_scheduler import (
            start_attendance_scheduler,
        )
        start_attendance_scheduler()

        from app.services.log_reminder_scheduler import start_automated_log_reminder_scheduler
        reminder_task = asyncio.create_task(start_automated_log_reminder_scheduler())

        from app.services.crm_sla_scheduler import start_crm_sla_scheduler
        sla_task = asyncio.create_task(start_crm_sla_scheduler())

        from app.services.crm_lead_processor import start_crm_lead_queue_scheduler
        lead_queue_task = asyncio.create_task(start_crm_lead_queue_scheduler())

        from app.services.crm_ingest import start_meta_form_poll_scheduler
        meta_poll_task = asyncio.create_task(start_meta_form_poll_scheduler())

        from app.services.crm_meeting_reminder_scheduler import start_crm_meeting_reminder_scheduler
        meeting_reminder_task = asyncio.create_task(start_crm_meeting_reminder_scheduler())

        from app.services.website_due_scheduler import start_website_due_scheduler
        website_scheduler_task = asyncio.create_task(start_website_due_scheduler())

        sync_task = asyncio.create_task(periodic_marketing_sync())

        from app.services.drive_direct import start_drive_share_sweeper
        drive_share_task = asyncio.create_task(start_drive_share_sweeper())

    yield

    cleanup_task.cancel()
    for task in (
        reminder_task,
        sla_task,
        lead_queue_task,
        meta_poll_task,
        meeting_reminder_task,
        website_scheduler_task,
        sync_task,
        drive_share_task,
    ):
        if task is not None:
            task.cancel()
    if run_schedulers:
        from app.services.attendance_scheduler import shutdown_attendance_scheduler
        shutdown_attendance_scheduler()
    await close_mongo_connection()

_docs = None if settings.IS_PRODUCTION else "/docs"
_redoc = None if settings.IS_PRODUCTION else "/redoc"
_openapi = None if settings.IS_PRODUCTION else "/openapi.json"

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Backend API for Reamarc AI Copywriter.",
    lifespan=lifespan,
    docs_url=_docs,
    redoc_url=_redoc,
    openapi_url=_openapi,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logging.getLogger(__name__).exception(f"Unhandled error on {request.method} {request.url.path}: {exc}")
    origin = request.headers.get("origin") or ""
    headers = {}
    from app.core.origins import is_worklane_origin
    if origin and (
        origin in settings.CORS_ORIGINS
        or is_worklane_origin(origin)
        or not settings.IS_PRODUCTION
    ):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred. Please try again later."},
        headers=headers,
    )


# CORS — production allowlist + strict oneworklane.com subdomain regex (no lookalikes)
_DEV_ORIGIN_REGEX = r"https?://(localhost|127\.0\.0\.1|testserver|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?"

from app.core.origins import WORKLANE_ORIGIN_REGEX, is_worklane_origin

_cors_kwargs = dict(
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Workspace-ID", "X-Account-ID", "X-Client", "X-Requested-With", "Range"],
    expose_headers=["X-Hidden-Count", "X-Total-Count", "Content-Range", "Accept-Ranges", "Content-Length"],
)
# Always allow https://<label>.oneworklane.com (and apex) via regex; list covers exact defaults.
_cors_kwargs["allow_origin_regex"] = (
    f"(?:{WORKLANE_ORIGIN_REGEX[1:-1]})|(?:{_DEV_ORIGIN_REGEX})"
    if not settings.IS_PRODUCTION
    else WORKLANE_ORIGIN_REGEX
)

from app.services.permissions import operations_view_only_middleware

app.middleware("http")(operations_view_only_middleware)
app.add_middleware(CORSMiddleware, **_cors_kwargs)

def should_enforce_csrf(*, method: str, has_auth_cookie: bool, has_bearer: bool) -> bool:
    """Cookie sessions need CSRF; Bearer tokens do not. JSON is not an exemption."""
    return method in ("POST", "PUT", "PATCH", "DELETE") and has_auth_cookie and not has_bearer


@app.middleware("http")
async def csrf_protection_middleware(request: Request, call_next):
    public_review_prefix = f"{settings.API_V1_STR}/content-calendar/public/"
    if request.url.path.startswith(public_review_prefix):
        return await call_next(request)

    has_auth_cookie = bool(request.cookies.get("access_token") or request.cookies.get("refresh_token"))
    has_bearer = bool(request.headers.get("authorization", "").strip().lower().startswith("bearer "))
    if should_enforce_csrf(method=request.method, has_auth_cookie=has_auth_cookie, has_bearer=has_bearer):
        origin = (request.headers.get("origin") or "").strip()
        custom_header = (
            (request.headers.get("x-requested-with") or "").strip().lower() == "xmlhttprequest"
            or bool(request.headers.get("x-workspace-id"))
        )

        # 1. Validate Origin when present
        if origin:
            allowed = set(settings.CORS_ORIGINS)
            is_valid_origin = origin in allowed or is_worklane_origin(origin)
            if not is_valid_origin and not settings.IS_PRODUCTION:
                is_valid_origin = bool(re.fullmatch(_DEV_ORIGIN_REGEX, origin))
            if not is_valid_origin:
                return JSONResponse(
                    status_code=403,
                    content={"detail": "CSRF verification failed: Origin not authorized."},
                )

        # 2. Block cross-site HTML forms in production (must supply custom header that forms cannot send)
        if not custom_header and settings.IS_PRODUCTION:
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF verification failed: Missing required request header."},
            )

    return await call_next(request)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    is_upload = request.url.path.startswith(
        ("/uploads/", f"{settings.API_V1_STR}/uploads/", "/thumbs/", f"{settings.API_V1_STR}/thumbs/")
    )
    if not is_upload:
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
        is_public_asset = "/public/review/" in request.url.path and "/assets/" in request.url.path
        # Video stays no-store: a cacheable video makes Chrome download the whole
        # file on page open even with preload="metadata" (measured: 15.3 MB vs 0.04 MB).
        is_video = response.headers.get("content-type", "").startswith("video/")
        if not (is_public_asset and "cache-control" in response.headers and not is_video):
            response.headers["Cache-Control"] = "private, no-store"
    else:
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["Content-Security-Policy"] = "default-src 'self' blob: data:; media-src 'self' blob: data:; img-src 'self' blob: data:;"
        # Keep the route's own caching (thumbs: 30 days, Drive originals: 7 days, downloads: no-store).
        if "cache-control" not in response.headers:
            response.headers["Cache-Control"] = "private, max-age=3600"

    if is_upload or "/public/review/" in request.url.path:
        kind = "thumb" if "/thumbs/" in request.url.path or "w=" in str(request.url.query) else "original"
        logging.getLogger("app.media").info(
            "media_egress kind=%s status=%s bytes=%s",
            kind, response.status_code, response.headers.get("content-length", "stream"),
        )
    response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=(), payment=()"
    if settings.IS_PRODUCTION:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# Uploads are served only via authenticated routes (not public StaticFiles / directory listings).
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "deliverables"), exist_ok=True)


@app.get("/uploads/{file_path:path}")
@app.get(f"{settings.API_V1_STR}/uploads/{{file_path:path}}")
async def serve_upload(
    file_path: str,
    request: Request,
    download: bool = Query(False, description="Force download attachment"),
    current_user: dict = Depends(get_current_user),
):
    """
    Authenticated upload server for proposals and deliverables.
    Streams directly from MongoDB GridFS with local disk fallback.
    Supports inline browser viewing for PDFs/images/videos, or attachment download.
    """
    db = get_database()
    await authorize_stored_upload(db, current_user, file_path)
    range_header = request.headers.get("range")
    return await open_upload_response(
        db, file_path, download=download, range_header=range_header,
        if_none_match=request.headers.get("if-none-match"),
    )


@app.get("/thumbs/{file_path:path}")
@app.get(f"{settings.API_V1_STR}/thumbs/{{file_path:path}}")
async def serve_upload_thumbnail(
    file_path: str,
    request: Request,
    w: int = Query(400, description="Preview width: 200, 400 or 800"),
    current_user: dict = Depends(get_current_user),
):
    """Small WebP preview of an uploaded image. Same access check as the original file."""
    from app.core.thumbs import thumbnail_response
    from app.core.uploads import normalize_upload_key, _caller_company_id

    db = get_database()
    await authorize_stored_upload(db, current_user, file_path)
    return await thumbnail_response(
        db,
        company_id=_caller_company_id(current_user) or "",
        relative=normalize_upload_key(file_path),
        width=w,
        if_none_match=request.headers.get("if-none-match"),
    )


# Include Active V1.0 Routers
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(admin.router, prefix=settings.API_V1_STR)
app.include_router(workspaces.router, prefix=settings.API_V1_STR)
app.include_router(marketing.router, prefix=settings.API_V1_STR)
app.include_router(daily_log.router, prefix=settings.API_V1_STR)
app.include_router(log_exceptions.router, prefix=settings.API_V1_STR)
app.include_router(shifts.router, prefix=settings.API_V1_STR)
app.include_router(attendance.router, prefix=settings.API_V1_STR)
app.include_router(leaves.router, prefix=settings.API_V1_STR)
app.include_router(company_calendar.router, prefix=settings.API_V1_STR)
app.include_router(mobile.router, prefix=settings.API_V1_STR)
app.include_router(web_push.router, prefix=settings.API_V1_STR)
app.include_router(crm_approvals.router, prefix=settings.API_V1_STR)
app.include_router(crm.router, prefix=settings.API_V1_STR)
app.include_router(crm_public.router, prefix=settings.API_V1_STR)
app.include_router(crm_public.router)
app.include_router(content_calendar.router, prefix=settings.API_V1_STR)
app.include_router(website_projects.router, prefix=settings.API_V1_STR)
app.include_router(drive.router, prefix=settings.API_V1_STR)
app.include_router(users.router, prefix=settings.API_V1_STR)
app.include_router(dashboard.router, prefix=settings.API_V1_STR)
app.include_router(access.router, prefix=settings.API_V1_STR)
app.include_router(owner.router, prefix=settings.API_V1_STR)
app.include_router(company.router, prefix=settings.API_V1_STR)
app.include_router(finance.router, prefix=settings.API_V1_STR)
app.include_router(worklane_public.router, prefix=settings.API_V1_STR)



@app.api_route("/", methods=["GET", "HEAD"])
@app.api_route("/health", methods=["GET", "HEAD"])
async def health_check():
    db = get_database()
    mongo_ok = False
    if db is not None:
        try:
            # TenantDB has no .command (attribute access returns a collection), so ping the raw DB.
            raw = db.raw() if hasattr(db, "raw") else db
            await raw.command("ping")
            mongo_ok = True
        except Exception:
            mongo_ok = False
    status_label = "healthy" if mongo_ok else "degraded"
    payload = {
        "status": status_label,
        "message": "Backend is online",
    }
    if not settings.IS_PRODUCTION:
        payload["mongo"] = mongo_ok
    return payload

