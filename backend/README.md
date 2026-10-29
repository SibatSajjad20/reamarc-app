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

On Render, use `backend/render-start.sh` or:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers ${WEB_CONCURRENCY:-1}
```

Set `RUN_SCHEDULERS=0` on extra workers so schedulers run once.

Docs are at `/docs` in development only. They are disabled when `ENVIRONMENT=production`.

## Production env (minimum)

- `ENVIRONMENT=production`
- `SECRET_KEY` — at least 32 random characters
- `MONGODB_URL` / `MONGODB_DB_NAME`
- `ALLOWED_ORIGINS` and `APP_FRONTEND_URL` — public app origins (production: `APP_FRONTEND_URL=https://oneworklane.com`; Worklane subdomains are allowed via CORS regex; keep `https://reamarc-app.vercel.app` working)
- `APP_BASE_DOMAIN` / `APP_API_URL` — defaults `oneworklane.com` / `https://api.oneworklane.com`
- `COOKIE_DOMAIN` — optional (e.g. `.oneworklane.com`); empty = host-only
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
