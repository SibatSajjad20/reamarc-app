from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
import logging
import os

logger = logging.getLogger("app.config")

_LOCAL_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://testserver",
    "https://testserver",
]

_DEFAULT_PRODUCTION_ORIGINS = [
    "https://reamarc.io",
    "https://www.reamarc.io",
    "https://reamarc.com",
    "https://www.reamarc.com",
    "https://reamarc-app.vercel.app",
]


class Settings(BaseSettings):
    PROJECT_NAME: str = "Reamarc AI Copywriter API"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"

    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60  # short-lived; refresh cookie renews session
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    COOKIE_SECURE: bool = True
    IS_PRODUCTION: bool = False
    # Dedicated Fernet key for ad credentials. Independent of JWT SECRET_KEY.
    ENCRYPTION_KEY: str = ""

    # MongoDB
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "copywriting_agent"

    # CORS
    ALLOWED_ORIGINS: str = ""
    CORS_ORIGINS: list[str] = list(_LOCAL_ORIGINS)

    # LLM Provider Configuration
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_MODEL: str = "openrouter/free"
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    GEMINI_API_KEY: str = ""
    PRIMARY_LLM_PROVIDER: str = "openrouter"
    FALLBACK_LLM_PROVIDER: str = "groq"

    # Email Delivery Configuration (HTTP APIs bypass cloud SMTP port blocking)
    RESEND_API_KEY: str = ""
    BREVO_API_KEY: str = ""
    SENDGRID_API_KEY: str = ""

    # SMTP Email Configuration (Zero-cost notifications fallback)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""
    SMTP_FROM_NAME: str = "Reamarc Workspace"
    SMTP_TLS: bool = True
    APP_FRONTEND_URL: str = "http://localhost:5173"

    # Office geofence / attendance security (WAN IPs from env only — no hardcoded allow-list)
    OFFICE_PUBLIC_IPS: str = ""
    OFFICE_LATITUDE: float = 33.52062764084008
    OFFICE_LONGITUDE: float = 73.09183393441234
    OFFICE_MAP_URL: str = "https://maps.app.goo.gl/8SAkMGdkjXnDgbYNA"
    GEOFENCE_RADIUS_METERS: float = 500.0
    MAX_GPS_ACCURACY_METERS: float = 500.0

    # CRM Meta Lead Ads (Reamarc Page only — not client ad accounts)
    CRM_META_PAGE_ID: str = ""
    CRM_META_PAGE_ACCESS_TOKEN: str = ""
    CRM_META_WEBHOOK_VERIFY_TOKEN: str = ""
    CRM_META_APP_SECRET: str = ""
    CRM_META_FORM_IDS: str = ""  # comma-separated form ids for poll backup

    # Web Push (VAPID). Private key stays on the server. Never commit it.
    # Generate with: python -m app.web_push_keys
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_SUBJECT: str = "mailto:faizan@reamarc.com"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_environment(self) -> "Settings":
        env_name = (self.ENVIRONMENT or os.getenv("ENVIRONMENT") or "development").strip().lower()
        if env_name in ("production", "prod"):
            object.__setattr__(self, "IS_PRODUCTION", True)

        extra = [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]
        if self.IS_PRODUCTION:
            # Production: Reamarc websites and Vercel app allowed by default + any explicit extra
            origins = list(_DEFAULT_PRODUCTION_ORIGINS)
            for origin in extra:
                if origin not in origins:
                    origins.append(origin)
            if self.APP_FRONTEND_URL and self.APP_FRONTEND_URL.rstrip("/") not in origins:
                origins.append(self.APP_FRONTEND_URL.rstrip("/"))
            object.__setattr__(self, "CORS_ORIGINS", origins)
        else:
            origins = list(_LOCAL_ORIGINS)
            for origin in _DEFAULT_PRODUCTION_ORIGINS:
                if origin not in origins:
                    origins.append(origin)
            for origin in extra:
                if origin not in origins:
                    origins.append(origin)
            object.__setattr__(self, "CORS_ORIGINS", origins)

        if not self.SECRET_KEY or len(self.SECRET_KEY.strip()) < 32:
            raise ValueError("SECRET_KEY environment variable must be set and at least 32 characters long.")

        if self.SECRET_KEY in ("your-super-secret-key-change-in-production", "secret", "change_me") and self.IS_PRODUCTION:
            raise ValueError("Insecure default SECRET_KEY detected in production environment.")

        if not self.MONGODB_URL or not self.MONGODB_URL.strip():
            raise ValueError("MONGODB_URL environment variable must be provided.")

        if self.IS_PRODUCTION:
            enc = (self.ENCRYPTION_KEY or "").strip()
            if not enc or enc == "32_byte_fernet_key_base64_encoded":
                raise ValueError(
                    "ENCRYPTION_KEY must be set in production "
                    "(dedicated Fernet key, independent of SECRET_KEY)."
                )

        if self.IS_PRODUCTION and not (self.OFFICE_PUBLIC_IPS or "").strip():
            raise ValueError(
                "OFFICE_PUBLIC_IPS must be set in production (comma-separated office WAN IPs). "
                "Refusing to start with an empty office IP allow-list."
            )

        # Meta CRM webhook: verify token and app secret are needed for webhook handshake and signature verification.
        # Page ID and Page Access Token can either be set here in .env or dynamically via the UI (crm_meta_pages).
        if self.IS_PRODUCTION:
            has_webhook = bool((self.CRM_META_WEBHOOK_VERIFY_TOKEN or "").strip())
            has_secret = bool((self.CRM_META_APP_SECRET or "").strip())
            if has_webhook and not has_secret:
                raise ValueError("CRM_META_APP_SECRET must be set when CRM_META_WEBHOOK_VERIFY_TOKEN is configured.")
            has_page_token = bool((self.CRM_META_PAGE_ACCESS_TOKEN or "").strip())
            has_page_id = bool((self.CRM_META_PAGE_ID or "").strip())
            if has_page_token and not has_page_id:
                raise ValueError("CRM_META_PAGE_ID must be set when CRM_META_PAGE_ACCESS_TOKEN is configured.")

        if not self.OPENROUTER_API_KEY and not self.GROQ_API_KEY and not self.GEMINI_API_KEY:
            logger.warning(
                "No LLM API keys configured (OPENROUTER_API_KEY, GROQ_API_KEY, GEMINI_API_KEY). "
                "AI generation will rely on free public endpoints or rule-based fallbacks."
            )

        return self


settings = Settings()
