import asyncio
import os
import sys
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import JSONResponse
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import connect_to_mongo, close_mongo_connection, get_database
from app.routers import (
    auth,
    attendance,
    companies,
    content_calendar,
    users,
    admin,
    owner_console,
    workspaces,
    marketing,
    daily_log,
    exceptions,
    notifications,
    public_review,
    crm,
    google_drive,
    company_branding,
)
from app.core.limiter import limiter
from app.core.tenant_middleware import TenantMiddleware
from app.core.tenant import get_tenant_context

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def _run_startup_cleanup():
    """Run non-critical startup cleanups after yielding to avoid delaying cold-start."""
    await asyncio.sleep(2)
    try:
        from app.services.attendance_service import cleanup_expired_otps
        db = get_database()
        cleaned = await cleanup_expired_otps(db)
        if cleaned > 0:
            logging.getLogger(__name__).info(f"Cleaned up {cleaned} expired OTP records")
    except Exception as e:
        logging.getLogger(__name__).error(f"Error in startup OTP cleanup: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Enforce strict startup assertions
    settings.validate_production_keys()

    await connect_to_mongo()

    # Pre-warm Google Drive auth in background (non-blocking)
    async def prewarm_drive():
        try:
            from app.services.google_drive_service import get_drive_service
            await asyncio.to_thread(get_drive_service)
            logger.info("Google Drive service pre-warmed successfully")
        except Exception as e:
            logger.warning(f"Google Drive pre-warm skipped/failed: {e}")

    asyncio.create_task(prewarm_drive())

    cleanup_task = asyncio.create_task(_run_startup_cleanup())

    run_schedulers = os.getenv("RUN_SCHEDULERS", "1") != "0"
    reminder_task = sla_task = lead_queue_task = meta_poll_task = None
    meeting_reminder_task = website_scheduler_task = sync_task = None

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

# Trust Reverse Proxy Headers (e.g. Render, Railway, Nginx) so client IP and scheme are detected correctly
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["*"])

app.add_middleware(SessionMiddleware, secret_key=settings.SECRET_KEY)

# Tenant scoping runs BEFORE CORS so 401/403/409 errors still get CORS headers.
# In Starlette, middleware added later wraps earlier middleware (runs first).
# So: add TenantMiddleware first, then CORSMiddleware after it.
app.add_middleware(TenantMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class NoCacheStaticFiles(StaticFiles):
    """Serve static files with no-cache headers in development so changes are picked up immediately."""
    def file_response(self, *args, **kwargs):
        resp = super().file_response(*args, **kwargs)
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
        return resp


_UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
os.makedirs(_UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", NoCacheStaticFiles(directory=_UPLOADS_DIR), name="uploads")


@app.middleware("http")
async def company_branding_header(request: Request, call_next):
    """Stamp each API response with the resolved tenant company's branding."""
    response = await call_next(request)
    try:
        from app.core.tenant import get_tenant_context, get_global_db
        ctx = get_tenant_context()
        if ctx and ctx.company_id:
            gdb = get_global_db()
            if gdb is not None:
                comp = await gdb.companies.find_one({"id": ctx.company_id}, {"brand_name": 1, "name": 1})
                if comp:
                    bname = comp.get("brand_name") or comp.get("name")
                    if bname:
                        response.headers["X-Company-Brand-Name"] = bname
    except Exception:
        pass
    return response


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    # Bypass auth and custom processing completely for CORS preflight OPTIONS requests
    if request.method == "OPTIONS":
        return await call_next(request)

    path = request.url.path
    if (
        settings.MULTI_COMPANY_ENABLED
        and path.startswith("/api/v1")
        and not path.startswith("/api/v1/owner")
        and not path.startswith("/api/v1/auth/login")
        and not path.startswith("/api/v1/auth/refresh")
        and not path.startswith("/api/v1/companies/active")
        and not path.startswith("/api/v1/public")
    ):
        ctx = get_tenant_context()
        if ctx and ctx.is_owner_session:
            allowed_get_prefixes = (
                "/api/v1/workspaces",
                "/api/v1/content-calendar",
                "/api/v1/marketing",
                "/api/v1/admin/members",
                "/api/v1/company-branding",
            )
            is_allowed_get = request.method == "GET" and any(path.startswith(p) for p in allowed_get_prefixes)
            if not is_allowed_get:
                return JSONResponse(
                    status_code=403,
                    content={
                        "detail": "Owner session is read-only for tenant data.",
                        "error_code": "OWNER_SESSION_READ_ONLY",
                    },
                )

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "img-src 'self' data: https:; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "connect-src 'self' https:;"
    )
    return response


api_v1_prefix = "/api/v1"
app.include_router(auth.router, prefix=f"{api_v1_prefix}/auth", tags=["auth"])
app.include_router(attendance.router, prefix=f"{api_v1_prefix}/attendance", tags=["attendance"])
app.include_router(daily_log.router, prefix=f"{api_v1_prefix}/daily-log", tags=["daily-log"])
app.include_router(exceptions.router, prefix=f"{api_v1_prefix}/exceptions", tags=["exceptions"])
app.include_router(content_calendar.router, prefix=f"{api_v1_prefix}/content-calendar", tags=["content-calendar"])
app.include_router(workspaces.router, prefix=f"{api_v1_prefix}/workspaces", tags=["workspaces"])
app.include_router(users.router, prefix=f"{api_v1_prefix}/users", tags=["users"])
app.include_router(admin.router, prefix=f"{api_v1_prefix}/admin", tags=["admin"])
app.include_router(owner_console.router, prefix=f"{api_v1_prefix}/owner", tags=["owner-console"])
app.include_router(marketing.router, prefix=f"{api_v1_prefix}/marketing", tags=["marketing"])
app.include_router(notifications.router, prefix=f"{api_v1_prefix}/notifications", tags=["notifications"])
app.include_router(crm.router, prefix=f"{api_v1_prefix}/crm", tags=["crm"])
app.include_router(google_drive.router, prefix=f"{api_v1_prefix}/drive", tags=["drive"])
app.include_router(public_review.router, prefix="/api/v1", tags=["public-review"])
app.include_router(companies.router, prefix=f"{api_v1_prefix}/companies", tags=["companies"])
app.include_router(company_branding.router, prefix=f"{api_v1_prefix}/company-branding", tags=["company-branding"])


@app.get("/")
def read_root():
    return {"message": "Welcome to Reamarc AI Copywriter API"}


@app.get("/health")
def health_check():
    return {"status": "ok"}
