from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
import logging

logger = logging.getLogger("app.config")

class Settings(BaseSettings):
    PROJECT_NAME: str = "Reamarc AI Copywriter API"
    API_V1_STR: str = "/api/v1"
    
    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60  # 1 hour
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    COOKIE_SECURE: bool = True
    IS_PRODUCTION: bool = False
    
    # MongoDB
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "copywriting_agent"
    
    # CORS
    ALLOWED_ORIGINS: str = ""
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]
    
    # LLM Provider Configuration
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_MODEL: str = "openrouter/free"
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    GEMINI_API_KEY: str = ""
    PRIMARY_LLM_PROVIDER: str = "openrouter"
    FALLBACK_LLM_PROVIDER: str = "groq"
    
    # SMTP Email Configuration (Zero-cost notifications)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""
    SMTP_FROM_NAME: str = "Reamarc Workspace"
    SMTP_TLS: bool = True
    APP_FRONTEND_URL: str = "http://localhost:5173"
    
    model_config = SettingsConfigDict(

        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @model_validator(mode="after")
    def validate_environment(self) -> "Settings":
        if self.ALLOWED_ORIGINS:
            origins = [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]
            for origin in origins:
                if origin not in self.CORS_ORIGINS:
                    self.CORS_ORIGINS.append(origin)

        if not self.SECRET_KEY or len(self.SECRET_KEY.strip()) < 8:
            raise ValueError("SECRET_KEY environment variable must be set and at least 8 characters long.")

        if self.SECRET_KEY in ("your-super-secret-key-change-in-production", "secret", "change_me") and self.IS_PRODUCTION:
            raise ValueError("Insecure default SECRET_KEY detected in production environment.")

        if not self.MONGODB_URL or not self.MONGODB_URL.strip():
            raise ValueError("MONGODB_URL environment variable must be provided.")

        if not self.OPENROUTER_API_KEY and not self.GROQ_API_KEY and not self.GEMINI_API_KEY:
            logger.warning("No LLM API keys configured (OPENROUTER_API_KEY, GROQ_API_KEY, GEMINI_API_KEY). AI generation will rely on free public endpoints or rule-based fallbacks.")

        return self

settings = Settings()
