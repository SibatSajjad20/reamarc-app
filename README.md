# Reamarc

Internal workspace for Reamarc: attendance, daily logs, HR, and performance marketing.

## Stack

| Surface | Stack | Host |
|---|---|---|
| Web app | React + TypeScript + Vite | Vercel |
| API | FastAPI + Motor/MongoDB | Render (`pip install -r requirements.txt` at repo root) |
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

## Roles and access

Access is fixed in code (`SYSTEM_ROLE_DEFAULTS` plus department rules). Stored `role_permissions` and per-person overrides are not applied.

| Role / department | What they get |
|---|---|
| **Admin** | View and manage everything in every module. |
| **Operations** | View-only access to every module and every department. Its only write action in sales is approving or rejecting won deals. Existing HR-style approvals (leave, WFH, shift change, attendance exceptions) stay. No ad credentials or secrets. |
| **HR** | Attendance, requests/approvals, team directory, and the daily log. No sales, website, content calendar, or performance marketing. |
| **Content / Creative / Social media** leads and members | Content calendar only, limited to their department's stages. Extra departments add calendar stages only. |
| **Website** leads and members | Website pipeline only. |
| **SEO / Performance marketing** leads and members | Performance marketing only. |
| **Sales** leads and members | Sales pipeline only (members: own/assigned leads; leads: all leads). |
| **Daily log** | Everyone except admin, operations, and HR. A lead sees their primary department's members; a member sees only their own. |
| **Client** | Their own workspace in the client portal only. |

Shared for all staff: dashboard cards for their modules, their own attendance and requests, notifications, profile and settings. Operations is a company-wide role (shown as **Operations**, never "Operations Lead").
