# Reamarc API

FastAPI backend for Reamarc (auth, attendance, daily logs, workspaces, marketing).

## Run

```bash
python -m venv venv
venv\Scripts\activate          # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env         # then fill SECRET_KEY and MONGODB_URL
uvicorn app.main:app --reload --port 8000
```

Docs are at `/docs` in development only. They are disabled when `ENVIRONMENT=production`.

## Production env (minimum)

- `ENVIRONMENT=production`
- `SECRET_KEY` — at least 32 random characters
- `MONGODB_URL` / `MONGODB_DB_NAME`
- `ALLOWED_ORIGINS` and `APP_FRONTEND_URL` — exact Vercel HTTPS origins
- `OFFICE_PUBLIC_IPS` — comma-separated office WAN IPs (**required** in production; empty list refuses to start)
- `ENCRYPTION_KEY` — Fernet key for ad tokens (`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`)

After deploying `ENCRYPTION_KEY`, encrypt any existing plaintext ad credentials:

```bash
python -m app.migrate_ad_credentials
```

## Layout

```
backend/app/
  main.py              # FastAPI app, CORS, security headers, schedulers
  config.py            # Settings from environment
  database.py          # Motor MongoDB
  core/                # JWT, bcrypt, encryption, uploads, rate limiter
  routers/             # auth, attendance, daily_log, admin, workspaces, marketing, …
  services/            # punch security, schedulers, email, ads sync
  constants/           # HQ geofence pin (WAN IPs come from env)
```
