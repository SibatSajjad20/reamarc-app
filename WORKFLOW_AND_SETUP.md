# Reamarc AI — Complete System Workflow & Setup Guide

Welcome to **Reamarc AI Copywriter**, an enterprise-grade B2B SaaS application designed for multi-channel social media copywriting, campaign planning, human-in-the-loop approval, and automated publishing.

---

## 🏛️ System Architecture & Tech Stack

```
                              ┌─────────────────────────────────────────┐
                              │           React Frontend (Vite)         │
                              │   TypeScript • Tailwind • Lucide Icons  │
                              └────────────────────┬────────────────────┘
                                                   │
                                      HTTP / REST API (JSON)
                                   Credentials: HttpOnly Cookies
                                                   │
                              ┌────────────────────▼────────────────────┐
                              │            FastAPI Backend              │
                              │   Pydantic v2 • PyJWT • Bcrypt • Async  │
                              └────────────────────┬────────────────────┘
                                                   │
                                      Async Motor Driver (Python)
                                                   │
                              ┌────────────────────▼────────────────────┐
                              │            MongoDB Database             │
                              │   Users • Campaigns • Posts Collections │
                              └─────────────────────────────────────────┘
```

### Stack Components:
* **Frontend**: React 18, Vite, TypeScript, Tailwind CSS v4, Lucide Icons, Custom Context API (`ToastContext`, `AuthContext`).
* **Backend**: Python 3.10+, FastAPI (Async), Motor (MongoDB driver), Pydantic v2, PyJWT, Passlib (Bcrypt), APScheduler.
* **Database**: MongoDB (v6.0+ recommended).

---

## 📁 Repository Structure

```
cagent/
├── backend/
│   ├── app/
│   │   ├── core/               # Security, JWT, Scheduler
│   │   │   ├── security.py
│   │   │   └── scheduler.py
│   │   ├── models/             # PyDantic & MongoDB Schemas
│   │   ├── schemas/            # DTO Request/Response Schemas
│   │   │   ├── auth.py
│   │   │   ├── campaign.py
│   │   │   └── post.py
│   │   ├── routers/            # REST API Route Controllers
│   │   │   ├── auth.py
│   │   │   ├── campaigns.py
│   │   │   └── posts.py
│   │   ├── config.py           # BaseSettings & Environment Variables
│   │   ├── database.py         # Motor MongoDB Client & Connections
│   │   └── main.py             # FastAPI App Entrypoint & CORS Config
│   ├── .env.example
│   ├── requirements.txt
│   └── README.md
├── src/
│   ├── components/
│   │   ├── auth/               # Auth Modal & Forms
│   │   ├── ui/                 # Primitives (Modal, PlatformIcon, Toast)
│   │   ├── views/              # Main Screen Views
│   │   │   ├── ApprovalInbox.tsx
│   │   │   ├── CampaignManager.tsx
│   │   │   ├── KnowledgeBase.tsx
│   │   │   └── SettingsView.tsx
│   │   ├── Sidebar.tsx
│   │   └── SocialIcons.tsx
│   ├── context/                # Global React Contexts
│   │   ├── AuthContext.tsx
│   │   └── ToastContext.tsx
│   ├── data/                   # Initial Seed Data
│   ├── hooks/                  # Custom Hooks (useAsync)
│   ├── services/               # API Integration Layer
│   │   ├── apiClient.ts
│   │   ├── authService.ts
│   │   ├── campaignService.ts
│   │   └── postService.ts
│   ├── types/                  # TypeScript Domain Interfaces
│   ├── utils/                  # Platform Limits & Helpers
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── package.json
├── tsconfig.app.json
├── vite.config.ts
└── WORKFLOW_AND_SETUP.md
```

---

## ⚙️ Environment Setup & Installation

### Prerequisites
* **Node.js** v18.0.0 or higher
* **Python** v3.10.0 or higher
* **MongoDB** server running locally (`mongodb://localhost:27017`) or a MongoDB Atlas URI.

---

### 1️⃣ Backend Setup (FastAPI)

1. Open a terminal and navigate to the `backend/` directory:
   ```bash
   cd backend
   ```

2. Create and activate a Python virtual environment:
   ```bash
   # Windows (PowerShell)
   python -m venv venv
   .\venv\Scripts\Activate.ps1

   # macOS / Linux
   python3 -m venv venv
   source venv/bin/activate
   ```

3. Install required Python packages:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure Environment Variables:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   *Edit `.env` if you need custom MongoDB credentials or LLM keys (`GEMINI_API_KEY`, `GROQ_API_KEY`).*

5. Start the FastAPI Development Server:
   ```bash
   python -m uvicorn app.main:app --reload --port 8000
   ```
   *The API will be live at `http://localhost:8000` with automatic interactive docs at `http://localhost:8000/docs`.*

---

### 2️⃣ Frontend Setup (React + Vite)

1. Open a second terminal window in the root directory:
   ```bash
   cd c:\Users\coco\Desktop\cagent
   ```

2. Install Node modules:
   ```bash
   npm install
   ```

3. Start the Vite Development Server:
   ```bash
   npm run dev
   ```
   *The web application will open at `http://localhost:5173`.*

4. Production Build Verification (Optional):
   ```bash
   npm run build
   ```

---

## 🔄 End-to-End Application Workflow

```
 ┌────────────────┐      ┌────────────────────┐      ┌─────────────────────┐      ┌──────────────────┐
 │                │      │                    │      │                     │      │                  │
 │ 1. Auth & Sign │ ───► │ 2. Create Campaign │ ───► │ 3. Approval Inbox   │ ───► │ 4. Post Approved │
 │    In Session  │      │    (7-Day Schedule)│      │    (Review & Polish)│      │    & Published   │
 │                │      │                    │      │                     │      │                  │
 └────────────────┘      └────────────────────┘      └─────────────────────┘      └──────────────────┘
```

### Step 1: Authentication & Workspace Selection
* Click **Sign In** in the sidebar bottom menu.
* Log in with existing credentials or register a new Director account.
* Use the top-left Workspace selector to switch brand contexts (e.g., *Nova Real Estate*, *TechFlow Inc.*).

### Step 2: Campaign Generation (Campaign Manager)
1. Navigate to **Campaign Manager** in the sidebar.
2. Click **+ Create New Campaign**.
3. Enter campaign details: Title, Target Audience, Tone of Voice (*Punchy*, *Professional*, *Witty*, *Bold*), and Target Social Platforms (*LinkedIn*, *Instagram*, *Twitter*, *Facebook*).
4. Click **Generate Plan**. The AI generator formats a 7-day post strategy tailored to each channel.
5. Click **Approve Plan & Deploy**. The campaign becomes active, and Day 1 copy is dispatched to the **Approval Inbox**.

### Step 3: Human-in-the-Loop Review & AI Polish (Approval Inbox)
1. Navigate to **Approval Inbox**.
2. Select a pending task from the scrollable left list.
3. Review the generated script in the central editor.
4. Use the **AI Refine Toolbar** for quick copy modifications:
   - **⚡ Make Punchy**: Rephrases key value propositions for high engagement.
   - **✨ Add Emojis**: Inserts visual emphasis and emojis.
   - **# Smart Hashtags**: Generates platform-specific trending tags.
   - **✓ Fix Grammar**: Cleans up formatting and syntax.
5. Check real-time word and character counters against platform-specific limits.

### Step 4: Approval & Automated Dispatch
* Press `Ctrl+Enter` or click **Approve & Publish**.
* The post is marked as `approved` in the backend API and queued for automated publishing.

### Step 5: Knowledge Base & Configuration
* **Knowledge Base**: Drop brand guidelines (PDFs) or scrape live company website URLs to train vector memory.
* **Settings**: Configure default LLM routing models (*Reamarc Copy-V3*, *Claude 3.5 Sonnet*, *GPT-4o*) and select visual themes (*Dark Mode* / *Light Mode*).

---

## 🔒 Security & Data Integrity Rules

1. **Session Security**: JWT tokens are stored in HttpOnly cookies with a Bearer header fallback, preventing XSS token extraction.
2. **CORS Enforcement**: Cross-Origin requests are strictly locked to authorized client URLs (`http://localhost:5173`, `http://localhost:3000`).
3. **Database Constraints**: A compound unique index `(campaign_id, target_date)` in MongoDB guarantees duplicate posts are never created.
4. **Offline Resiliency**: If the backend server is temporarily unreachable, the frontend seamlessly retains local state and alerts the user gracefully via toast notifications.
