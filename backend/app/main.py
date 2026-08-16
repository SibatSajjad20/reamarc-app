import logging
import json
from datetime import datetime, timezone
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.config import settings
from app.database import connect_to_mongo, close_mongo_connection
from app.routers import auth, admin, workspaces, marketing, daily_log

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

limiter = Limiter(key_func=get_remote_address)

import asyncio

@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()

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

    from app.services.log_reminder_scheduler import start_automated_log_reminder_scheduler
    reminder_task = asyncio.create_task(start_automated_log_reminder_scheduler())

    sync_task = asyncio.create_task(periodic_marketing_sync())

    yield

    reminder_task.cancel()
    sync_task.cancel()
    await close_mongo_connection()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Backend API for Reamarc AI Copywriter.",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS Setup for React Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=r"https?://.*\.vercel\.app|https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Hidden-Count", "X-Total-Count"],
)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if settings.IS_PRODUCTION:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# Include Active V1.0 Routers
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(admin.router, prefix=settings.API_V1_STR)
app.include_router(workspaces.router, prefix=settings.API_V1_STR)
app.include_router(marketing.router, prefix=settings.API_V1_STR)
app.include_router(daily_log.router, prefix=settings.API_V1_STR)

# Disabled Non-V1 Modules (Disabled for V1.0 Scope)
# app.include_router(campaigns.router, prefix=settings.API_V1_STR)
# app.include_router(posts.router, prefix=settings.API_V1_STR)
# app.include_router(knowledge.router, prefix=settings.API_V1_STR)
# app.include_router(matrix.router, prefix=settings.API_V1_STR)
# app.include_router(portal.router, prefix=settings.API_V1_STR)
# app.include_router(dashboard.router, prefix=settings.API_V1_STR)



@app.api_route("/health", methods=["GET", "HEAD"])
def health_check():
    return {"status": "healthy", "message": "Backend is online"}

