import logging
import json
import os
from datetime import datetime, timezone
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.config import settings
from app.core.limiter import limiter
from app.database import connect_to_mongo, close_mongo_connection, get_database
from app.routers import auth, admin, workspaces, marketing, daily_log, shifts, attendance, leaves, company_calendar, log_exceptions, mobile

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
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.handlers = [handler]

setup_logging()

import asyncio

@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()

    # Run data cleanups and checks in background so uvicorn binds to $PORT immediately
    async def _run_startup_cleanup():
        try:
            db = get_database()
            if db is not None:
                await db.daily_log_entries.delete_many({"date": {"$lt": "2026-08-19"}})
                await db.daily_logs.delete_many({"date": {"$lt": "2026-08-19"}})
                from app.services.attendance_golive import purge_pre_go_live_attendance
                await purge_pre_go_live_attendance()
                # Ensure HR users have department "HR"
                await db.users.update_many(
                    {"role": {"$in": ["hr", "HR"]}, "$or": [{"department": "All"}, {"department": None}, {"department": ""}]},
                    {"$set": {"department": "HR"}}
                )
                hr_users = await db.users.find({"role": {"$in": ["hr", "HR"]}}, {"id": 1, "full_name": 1, "name": 1}).to_list(100)
                import re as _re
                for h in hr_users:
                    h_name = h.get("full_name") or h.get("name")
                    if h_name:
                        await db.daily_log_entries.update_many(
                            {"$or": [{"user_id": h.get("id")}, {"resource_name": {"$regex": f"^{_re.escape(h_name)}$", "$options": "i"}}], "department": {"$in": ["All", "", None]}},
                            {"$set": {"department": "HR"}}
                        )
        except Exception as err:
            logging.getLogger(__name__).warning(f"Epoch log purge / HR dept update warning: {err}")

    cleanup_task = asyncio.create_task(_run_startup_cleanup())

    # Start 6-hour background sync task for performance marketing
    async def periodic_marketing_sync():
        while True:
            try:
                # Sleep 6 hours (21600 seconds) between runs
                await asyncio.sleep(21600)
                from app.services.marketing_sync import run_daily_ad_metrics_sync
                await run_daily_ad_metrics_sync()
            except asyncio.CancelledError:
                break
            except Exception as err:
                logging.getLogger(__name__).error(f"Error in periodic marketing sync loop: {err}")

    from app.services.attendance_scheduler import (
        start_attendance_scheduler,
        shutdown_attendance_scheduler,
    )
    start_attendance_scheduler()

    from app.services.log_reminder_scheduler import start_automated_log_reminder_scheduler
    reminder_task = asyncio.create_task(start_automated_log_reminder_scheduler())

    sync_task = asyncio.create_task(periodic_marketing_sync())

    yield

    cleanup_task.cancel()
    reminder_task.cancel()
    sync_task.cancel()
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

# CORS — production uses explicit allowlist only (no *.vercel.app regex)
_cors_kwargs = dict(
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Workspace-ID", "X-Account-ID", "X-Client"],
    expose_headers=["X-Hidden-Count", "X-Total-Count"],
)
if not settings.IS_PRODUCTION:
    _cors_kwargs["allow_origin_regex"] = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"

app.add_middleware(CORSMiddleware, **_cors_kwargs)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=(), payment=()"
    if settings.IS_PRODUCTION:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# Uploads are served only via authenticated download routes (not public StaticFiles).
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "deliverables"), exist_ok=True)

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

# Disabled Non-V1 Modules (Disabled for V1.0 Scope)
# app.include_router(campaigns.router, prefix=settings.API_V1_STR)
# app.include_router(posts.router, prefix=settings.API_V1_STR)
# app.include_router(knowledge.router, prefix=settings.API_V1_STR)
# app.include_router(matrix.router, prefix=settings.API_V1_STR)
# app.include_router(portal.router, prefix=settings.API_V1_STR)
# app.include_router(dashboard.router, prefix=settings.API_V1_STR)



@app.api_route("/", methods=["GET", "HEAD"])
@app.api_route("/health", methods=["GET", "HEAD"])
async def health_check():
    db = get_database()
    mongo_ok = False
    if db is not None:
        try:
            await db.command("ping")
            mongo_ok = True
        except Exception:
            mongo_ok = False
    status_label = "healthy" if mongo_ok else "degraded"
    return {
        "status": status_label,
        "message": "Backend is online",
        "mongo": mongo_ok,
    }
