# Reamarc

Internal workspace for Reamarc: attendance, daily logs, HR, and performance marketing.

## Stack

| Surface | Stack | Host |
|---|---|---|
| Web app | React + TypeScript + Vite | Vercel |
| API | FastAPI + Motor/MongoDB | Render |
| Mobile | Expo (Android / iOS) | EAS |

## Local development

```bash
# API (from backend/)
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# Set SECRET_KEY (>=32 chars) and MONGODB_URL
uvicorn app.main:app --reload --port 8000

# Web (repo root)
npm install
npm run dev

# Mobile (from mobile/)
npm install
npx expo start
```

Production requires `ENVIRONMENT=production`, `ALLOWED_ORIGINS` (exact Vercel origin), `OFFICE_PUBLIC_IPS` (comma-separated office WAN IPs), and a long random `SECRET_KEY`. Set `ENCRYPTION_KEY` (Fernet) before storing ad credentials, then run `python -m app.migrate_ad_credentials` from `backend/`.
