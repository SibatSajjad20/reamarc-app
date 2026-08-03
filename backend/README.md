# AI Social Media Copywriting & Publishing Agent - Backend

FastAPI backend for AI Social Media Copywriting & Publishing Agent V1.

## Directory Structure

```
backend/
├── app/
│   ├── main.py                   # FastAPI Application Entry Point
│   ├── config.py                 # Configuration & Environment Variables
│   ├── database.py               # Motor MongoDB Connection & Utilities
│   ├── core/
│   │   ├── security.py           # JWT Authentication & Password Hashing
│   │   └── scheduler.py          # APScheduler In-Process Job Scheduler
│   ├── models/                   # PyDantic & MongoDB Document Schemas
│   │   ├── user.py
│   │   ├── campaign.py
│   │   ├── post.py
│   │   └── connection.py
│   ├── schemas/                  # Request / Response Schemas
│   │   ├── auth.py
│   │   ├── campaign.py
│   │   ├── post.py
│   │   └── dashboard.py
│   ├── services/                 # Core Business Logic
│   │   ├── campaign_service.py
│   │   ├── generation_service.py
│   │   └── publishing_service.py
│   ├── adapters/                 # Third-Party Integrations
│   │   ├── llm/                  # Configurable LLM Providers & Fallback
│   │   │   ├── base.py
│   │   │   ├── gemini.py
│   │   │   ├── groq.py
│   │   │   └── fallback.py
│   │   └── social/               # Native Social Media Publishers
│   │       ├── base.py
│   │       └── facebook.py
│   └── routers/                  # API Endpoint Controllers
│       ├── auth.py
│       ├── campaigns.py
│       ├── posts.py
│       ├── dashboard.py
│       ├── connections.py
│       └── jobs.py
├── requirements.txt
└── .env.example
```

## Setup & Running

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment template
cp .env.example .env

# Run dev server
uvicorn app.main:app --reload --port 8000
```
