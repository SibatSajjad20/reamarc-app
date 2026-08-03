# Technical Requirements Document
## AI Social Media Copywriting & Publishing Agent — V1

**Status:** Draft for review
**Companion to:** copywriting-agent-prd-v1.md
**Doc version:** 1.0

---

## 1. System Architecture Overview

This is a **single-tenant, low-traffic internal tool** — one company, a handful of campaigns, a few reviewers a day. That constraint drives every decision below: a monolith with a scheduled job runner is the right shape here, not a distributed system. Don't reach for microservices, message queues, or multi-region anything until there's an actual reason (there won't be one at this scale for a long time).

```
┌─────────────────┐         ┌──────────────────────────────┐
│   Next.js App    │  REST   │        FastAPI Backend        │
│   (Dashboard)     │◄──────►│                                │
│                   │  JSON   │  ┌──────────────────────────┐ │
└─────────────────┘         │  │  API layer (routers)      │ │
                              │  └──────────┬───────────────┘ │
                              │             │                  │
                              │  ┌──────────▼───────────────┐ │
                              │  │  Service layer            │ │
                              │  │  - Campaign service        │ │
                              │  │  - Generation service      │ │
                              │  │  - Publishing service      │ │
                              │  └──────────┬───────────────┘ │
                              │             │                  │
                              │  ┌──────────▼───────────────┐ │
                              │  │  Provider adapters        │ │
                              │  │  - LLM provider (config)  │ │
                              │  │  - Platform publisher      │ │
                              │  └───────────────────────────┘ │
                              └───────────────┬────────────────┘
                                              │
                          ┌───────────────────┼────────────────────┐
                          ▼                   ▼                    ▼
                   ┌─────────────┐   ┌─────────────────┐  ┌──────────────┐
                   │  MongoDB     │   │  LLM providers    │  │  Social API   │
                   │              │   │  (Gemini/Groq/…)  │  │  (native)     │
                   └─────────────┘   └─────────────────┘  └──────────────┘
                          ▲
                          │
                 ┌──────────────────┐
                 │  Scheduler         │
                 │  (in-process,      │
                 │  single instance)  │
                 │  - weekly generate │
                 │  - publish sweep   │
                 │  - retry sweep     │
                 └──────────────────┘
```

**Deployment shape:** one FastAPI process serving the API, plus the scheduler running inside that same process (or a second small worker process if you want to isolate it). One MongoDB instance. One Next.js app. No queue broker, no separate worker fleet — there isn't enough job volume to justify one.

---

## 2. Frontend Responsibilities (Next.js)

Keep the frontend a thin client. **All business logic lives in the backend** — this matters more than it sounds like it should, because the moment validation or status logic gets duplicated between Next.js and FastAPI, they will drift and you'll get bugs that only show up in one of the two.

Frontend owns:
- Login form → calls backend `/auth/login`, stores session (see Section 6)
- Campaign management screens (create/edit/pause/archive) — forms only, no derived business rules
- Review dashboard: today's queue, inline edit box, Approve / Reject / Regenerate buttons
- Status board: campaigns × days × status, pulled from a single backend summary endpoint
- Client-side form validation (required fields, basic length hints) as a UX nicety — **not** a substitute for backend validation (platform character limits etc. must be enforced server-side, since that's the source of truth)

Rendering approach: mostly client-rendered against the REST API is fine for an internal dashboard — there's no SEO need and no public traffic, so don't over-invest in SSR/ISR here. Use Next.js server components only where they simplify data fetching (e.g., initial dashboard load), not as an architectural requirement.

---

## 3. Backend Responsibilities (FastAPI)

**API layer** — thin routers, request/response validation via Pydantic, auth checks, delegates to services.

**Service layer** — where the actual logic lives:
- `CampaignService`: CRUD, pause/resume semantics (pausing stops future generation, never touches already-approved posts — per PRD edge case).
- `GenerationService`: builds the few-shot prompt from campaign voice + sample posts, calls the LLM provider adapter, applies the banned-word check, writes `pending_review` posts, and **skips any date that already has a post** (guards against the batch job clobbering an edit — this is a hard PRD requirement, not optional).
- `PublishingService`: validates platform-specific length/format rules before accepting an approval, calls the platform publisher adapter, handles retry/backoff, writes final status.

**Provider adapters** — this is the piece worth building carefully, because it's the one place the PRD explicitly calls out as a recurring failure mode (free-tier models get deprecated or rate-limited without warning):
- `LLMProvider` interface with one method (`generate(prompt, params) -> text`) and multiple implementations (Gemini, Groq, OpenRouter). Provider + model name comes from **config, not code** — swapping providers should be a config change and a restart, never a deploy.
- A simple ordered fallback list: try provider 1, on rate-limit/error fall to provider 2, log which provider actually produced each post (useful for debugging quality issues later).
- `SocialPublisher` interface with one method (`publish(post) -> platform_post_id`), one implementation for V1 (whichever platform you pick first).

**Scheduler jobs** (see Section 8 for why in-process is the right call at this scale):
- Weekly generation job (e.g., Sunday 20:00 local time)
- Daily publish sweep (publishes anything `approved` and due)
- Retry sweep for `publish_failed` posts within the retry window

---

## 4. Database Schema Proposal (MongoDB)

Four collections. Keep documents flat where possible — this is a small dataset, there's no need for aggressive normalization.

### `users`
```
{
  _id,
  email,
  password_hash,
  role: "admin",        // single value for V1, but keep the field —
                         // cheap insurance for the PRD's open question
                         // about multiple reviewers later
  created_at
}
```

### `campaigns`
```
{
  _id,
  name,
  brand_voice_description,
  sample_posts: [string],       // 3–5 reference posts
  platforms: [string],          // e.g. ["facebook"] — array even though
                                 // V1 only auto-publishes to one, so
                                 // "manual post elsewhere" isn't a schema change later
  posting_days: [string],       // e.g. ["mon","tue","wed","thu","fri"]
  posting_time: string,         // "09:00", interpreted in company's fixed timezone
  status: "active" | "paused" | "archived",
  created_at,
  updated_at
}
```

### `posts`
```
{
  _id,
  campaign_id,
  target_date,                  // date this post is scheduled for
  platform,
  content: string,               // current/latest text — no version history in V1
  status: "pending_review" | "approved" | "rejected"
        | "published" | "publish_failed" | "skipped",
  generated_by: { provider, model },   // which LLM produced it — for debugging
  publish_attempts: int,
  last_error: string | null,
  platform_post_id: string | null,     // set once published
  reviewed_by: user_id | null,
  reviewed_at: datetime | null,
  published_at: datetime | null,
  created_at
}
```

### `platform_connections`
```
{
  _id,
  platform,                     // "facebook", etc.
  account_name,
  access_token_encrypted,       // encrypted at rest, never returned in API responses
  token_expires_at,
  connected_at
}
```

**Indexes:**
- `posts`: compound index on `(campaign_id, target_date)` — unique, this is what enforces "don't generate a second post for a date that already has one." Also index `status` for the dashboard queue queries.
- `campaigns`: index on `status` (filtering active campaigns for the generation job).
- `users`: unique index on `email`.

No separate "generation logs" or "publish logs" collection for V1 — `generated_by`, `publish_attempts`, and `last_error` on the post itself cover what you need without a second collection to keep in sync.

---

## 5. API Structure

REST, versioned under `/api/v1`. Grouped by resource, not by "actions" — keeps the surface predictable.

**Auth**
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`

**Campaigns**
- `GET /api/v1/campaigns`
- `POST /api/v1/campaigns`
- `GET /api/v1/campaigns/{id}`
- `PATCH /api/v1/campaigns/{id}` (edit fields, or change status to paused/archived)
- `DELETE /api/v1/campaigns/{id}` (soft delete → archived, not a hard delete)

**Posts**
- `GET /api/v1/posts?status=pending_review&date=today` (review queue)
- `GET /api/v1/posts/{id}`
- `PATCH /api/v1/posts/{id}` (edit content — saves as the new current text)
- `POST /api/v1/posts/{id}/approve`
- `POST /api/v1/posts/{id}/reject`
- `POST /api/v1/posts/{id}/regenerate`
- `POST /api/v1/posts/{id}/mark-posted-manually` (for platforms not yet integrated, per PRD)

**Dashboard**
- `GET /api/v1/dashboard/summary` (campaigns × days × status, for the status board)

**Platform connections**
- `GET /api/v1/platform-connections`
- `POST /api/v1/platform-connections` (OAuth callback / token exchange)

**Internal (service-to-service, not user-facing)**
- `POST /api/v1/internal/jobs/generate-weekly`
- `POST /api/v1/internal/jobs/publish-sweep`
- `POST /api/v1/internal/jobs/retry-sweep`

(These internal endpoints exist even though the scheduler is in-process for V1 — it keeps the job logic callable/testable independently, and makes it trivial to move the scheduler to an external cron or a separate process later without touching the API.)

---

## 6. Authentication Strategy

**User auth (dashboard login):** email + password, hashed with bcrypt, session via a short-lived JWT stored in an **httpOnly, secure cookie** — not localStorage, to avoid XSS exposure. No refresh-token dance needed at V1 scale; a cookie with a reasonable expiry (e.g., 7 days) and re-login on expiry is simpler and sufficient for an internal tool used by a handful of people.

Single `role: "admin"` value for V1, but the field exists on the user document so adding an `"editor"` or `"approver"` role later (per the PRD's open question about multiple reviewers) is a config/permission-check change, not a schema migration.

**Internal job endpoints:** protected by a shared secret (static bearer token from environment config), not user JWTs — these are called by the scheduler/cron, not a logged-in person. Keep this separate from user auth so job endpoints can't be triggered by a regular dashboard session token by mistake.

**Social platform auth:** OAuth2 flow per platform to obtain a long-lived page/account access token. Store it encrypted (e.g., via `cryptography.fernet` with a key from environment/secrets manager, not committed to the repo) in `platform_connections`. Build a simple expiry check into the publish sweep so an expiring token surfaces as a visible dashboard warning before it silently starts failing publishes.

---

## 7. Third-Party Dependencies

| Purpose | Choice | Why | Alternative considered |
|---|---|---|---|
| LLM (primary) | Gemini API | Best free-tier capability-to-limit ratio right now — frontier-class model, generous daily quota, no card required | — |
| LLM (fallback) | Groq | Fast, separate rate-limit pool, good safety net when the primary is throttled | OpenRouter, if you want more model variety behind one key |
| Async Mongo driver | Motor | Matches FastAPI's async model — LLM and social API calls are I/O-bound, so the whole request path stays non-blocking | PyMongo (sync) — fine too at this traffic level, but Motor keeps the codebase consistent |
| Password hashing | passlib (bcrypt) | Standard, well-audited | — |
| JWT | pyjwt or python-jose | Either is fine; pick one and don't add both | — |
| Scheduler | APScheduler (in-process) | Zero extra infra, sufficient for a handful of jobs/week — see Section 8 | Celery + Redis — explicitly **not** recommended yet, see below |
| Social publishing | Native platform API (e.g., Meta Graph API) for the one integrated platform | No point paying for or self-hosting an aggregator to talk to one platform | Postiz (self-hosted, open-source) — worth adopting once you're integrating 2–3+ platforms, not before |
| Secrets/token encryption | `cryptography` (Fernet) | Simple symmetric encryption for tokens at rest | A full secrets manager (Vault etc.) — overkill for one company's credentials |
| LangChain/LangGraph | Not included in V1 | Direct SDK calls to the LLM provider are simpler to debug and sufficient for a single generate-and-review loop; add it if/when you need real branching logic (multi-step validation, multi-platform reformatting chains) | — |

---

## 8. Scalability Considerations

Be honest about what "scale" means here: one company, a handful of campaigns, one post per campaign per day, one review pass per day. The system needs to be **reliable**, not **scalable** in the usual sense — so most of this section is about failure modes, not throughput.

**What's already handled by the design above:**
- LLM rate limits → fallback provider chain
- Provider deprecating a model → config-driven model selection, no redeploy needed
- Publish failures → retry with backoff, visible failure state, no silent drops
- Duplicate generation → unique index on `(campaign_id, target_date)`

**Near-term growth (more campaigns, more platforms) — no architecture change needed:**
- The generation job iterates campaigns; a few dozen campaigns still finishes in seconds against a fast LLM API. No parallelization work needed until you're well past that.
- Adding a second/third platform is a new `SocialPublisher` implementation, not a schema or architecture change — this is exactly why the adapter interface exists.

**One thing to get right early, because it's a real risk at any scale:** if you ever run more than one instance of the FastAPI process (e.g., for zero-downtime deploys or basic redundancy), **the in-process scheduler must run in exactly one of them**, or the weekly generation and publish-sweep jobs will double-fire. Either designate one instance as the scheduler owner via a simple leader flag/env var, or move the trigger to an external cron hitting the `/internal/jobs/*` endpoints — this is a cheap fix to design for now and a genuinely annoying bug to chase later if you don't.

**What's explicitly *not* worth building yet:**
- A message queue (Celery/Redis, SQS, etc.) — there's no job volume or concurrency problem this solves at V1 scale. Revisit only if job count grows into the hundreds/thousands or you need distributed workers.
- Sharding, read replicas, or any Mongo scaling beyond a single instance — dataset size here is trivial (campaigns × posts × a few hundred rows) for years, even with generous growth.
- Multi-tenancy — the PRD marks this explicitly out of scope. If you want one piece of cheap insurance: add an unused `tenant_id` field (defaulted to a single constant) to `campaigns` and `users` now, so if agency mode ever happens, it's a migration of values, not a schema redesign. Don't build any logic around it yet.

---

## 9. Open Questions for You

1. Do you want the scheduler to live in the same process as the API, or as a separate small worker process from day one? (Either is fine at this scale — separate process is marginally safer against the double-fire risk in Section 8, at the cost of one more thing to deploy.)
2. Which platform's OAuth app do you want to register first — this determines the first `SocialPublisher` implementation and needs API access approval lead time from the platform itself.
3. Is a 7-day cookie session acceptable for the dashboard, or does company policy require shorter sessions / MFA for anything touching social accounts?
