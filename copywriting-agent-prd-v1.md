# Product Requirements Document
## AI Social Media Copywriting & Publishing Agent — V1

**Status:** Draft for review
**Owner:** [You]
**Doc version:** 1.0

---

## 1. Problem Statement

Company social channels need a steady stream of on-brand content, but writing it manually every day doesn't scale: someone has to sit down, think of a topic, write copy, check tone, and post it — every single day, across multiple platforms. This is slow, inconsistent in quality, and depends entirely on one person's bandwidth.

The company needs a system that:
- Drafts a week's worth of content in one batch, so writing isn't a daily bottleneck.
- Lets a human quickly review, edit, and approve each day's post rather than trusting AI output blindly.
- Publishes automatically once approved, so approval is the only manual step left.
- Gives visibility into what's scheduled, what's pending, and what's already gone out — across campaigns.

**Core insight:** the goal isn't "AI writes everything," it's "AI drafts, human approves in seconds, system handles the rest." The product's value is entirely in how fast and trustworthy that daily review step feels — everything else is plumbing around it.

---

## 2. Target Users

| User | Role in the product |
|---|---|
| **Content/Campaign Owner** (primary) | Sets up a campaign: brand voice, platforms, posting cadence, sample content. Reviews and edits daily drafts. Approves for publishing. |
| **Admin** | Manages campaigns, connects social accounts, monitors what's live vs. pending. In V1 this may be the same person as the Content Owner. |

There is no external/customer-facing user in V1 — this is an internal tool for the company's own social media operations, single-tenant (one company, one set of brand voices/campaigns).

---

## 3. Core User Flows

### Flow A — Set up a campaign
1. Admin creates a campaign: name, brand/product description, tone/voice notes, target platform(s), posting days (e.g., Mon–Fri), and 3–5 example posts (for style reference).
2. Campaign is saved as **active**.

### Flow B — Weekly batch generation
1. On a scheduled trigger (e.g., every Sunday night), the system generates a draft post for each active campaign for each scheduled day of the coming week.
2. Each draft is created with status **`pending_review`** and stored against its target date.
3. No content is posted at this stage — everything sits in the review queue.

### Flow C — Daily review & edit
1. Each day, the Content Owner opens the dashboard and sees today's draft(s) needing review.
2. They can:
   - Edit the text inline, or
   - Regenerate (ask the AI for another version), or
   - Reject (skip posting today), or
   - Approve as-is.
3. Edits are saved as the new version of that post — the system does not silently regenerate over a human edit.

### Flow D — Approval → auto-publish
1. On approval, the post is queued for publishing at the campaign's configured time.
2. The system calls the relevant platform's posting API.
3. On success: status → **`published`**, timestamp logged.
4. On failure: status → **`publish_failed`**, retried a limited number of times, then flagged for manual attention.

### Flow E — Dashboard monitoring
1. Admin/Content Owner views a board of all campaigns with post status per day (pending / approved / published / failed / skipped).
2. They can pause a campaign (stops future generation; does not touch already-approved posts).

---

## 4. Feature List

### MVP (V1 — build this first)

**Campaign management**
- Create / edit / pause / archive a campaign
- Fields: name, brand voice description, 3–5 sample posts, target platform(s), posting days/frequency, posting time

**Content generation**
- One scheduled batch job per week per active campaign
- Prompt built from: brand voice description + sample posts (few-shot, no vector DB needed at this scale) + day/topic hint
- Uses a free-tier LLM (see stack notes) with a **fallback provider** if the primary is rate-limited

**Review dashboard**
- Daily queue of posts needing review, grouped by campaign
- Inline edit, regenerate, approve, reject actions
- Version history is not required in V1 — just store the latest edited text

**Publishing**
- Auto-publish on approval to **one platform first** (pick whichever the company actually uses most — e.g., Facebook Page or LinkedIn Page)
- Manual "mark as posted elsewhere" toggle for any platform not yet integrated, so the workflow isn't blocked while you add platforms one at a time
- Retry logic (e.g., 3 attempts) + failure flag visible on dashboard

**Auth**
- Simple login (single admin role is enough — no permission tiers yet)

**Status tracking**
- Post statuses: `pending_review → approved/rejected → published/publish_failed`

---

### Future (post-V1 — do not build yet)

- Additional platform integrations (Instagram, X, TikTok captions, etc.)
- RAG over historical brand content / knowledge base (only worth it once you have enough real approved posts to retrieve from — few-shot prompting covers this need at V1 scale)
- Multi-brand / agency mode (multiple companies/clients in one instance)
- Rejection-as-training: feeding edit/rejection patterns back into the prompt or a fine-tuned style model
- Bilingual (English/Urdu) generation
- Image/video generation for posts
- Analytics on published post performance (likes/reach) feeding back into future generation
- Scheduling calendar with drag-and-drop rescheduling
- Team roles & permissions (approver vs. editor vs. admin)
- Slack/Telegram/WhatsApp approval pings instead of dashboard-only review
- A/B variants generated per post

---

## 5. Edge Cases

- **LLM output is off-brand, factually wrong, or inappropriate** → never auto-publish without human approval (this is already enforced by design); add a lightweight profanity/banned-word check before it even reaches the review queue.
- **Free-tier LLM rate limit hit mid-batch** → automatic fallback to a secondary provider; log which provider generated which post.
- **A model or provider changes/removes a model without notice** (this happens often on free tiers) → config-driven model selection, not hardcoded model names, so you can swap without a redeploy.
- **Nobody reviews before the scheduled post time** → default behavior should be "do not publish" (skip the day), not "auto-publish the unreviewed draft." Surface a clear "missed" state on the dashboard.
- **Campaign paused mid-week** → stop future generation immediately; leave already-approved, already-queued posts alone unless explicitly cancelled.
- **Platform API failure at publish time** (expired token, rate limit, downtime) → retry with backoff, then flag as `publish_failed` with the error reason visible — don't fail silently.
- **Two days' content ends up near-duplicate** → not a hard blocker for V1, but worth a simple similarity check as a warning label on the review screen (not an auto-reject).
- **Platform character/format limits** (e.g., X's length limits vs. LinkedIn) → validate length per target platform before allowing approval.
- **User edits a post, then batch job re-runs before it's published** → the batch job must never touch a post that already exists for that date; only generate for empty slots.
- **Time zone mismatch** between server, admin, and scheduled posting time → store and schedule everything in one explicit time zone (company's local time), not server-default UTC assumptions.

---

## 6. Non-Goals (explicitly out of scope for V1)

- No paid LLM usage — testing phase runs entirely on free-tier models.
- No RAG / vector database — brand voice comes from prompt + sample posts, not retrieval.
- No multi-brand/agency support — single company, single set of campaigns.
- No image or video generation — text captions only.
- No mobile app — web dashboard only.
- No granular permissions/roles — one admin-level access tier.
- No performance analytics dashboard (likes, reach, engagement) — that's a v2 concern once there's a publishing history to analyze.
- No chat-based approval (Telegram/Slack) — dashboard is the only review surface in V1.

---

## 7. Success Metrics

| Metric | What it tells you |
|---|---|
| **Manual writing time saved / week** | Is this actually replacing the manual process? (baseline vs. after adoption) |
| **% of drafts approved with no edits** | Is the AI's brand-voice matching actually good, or is every post being rewritten? |
| **% of scheduled posts published without manual fallback** | Is the automation reliable enough to trust? |
| **Publish success rate** (published / approved) | Is the platform integration solid? |
| **Average time from draft ready → approved** | Is the review step actually fast, or is it becoming a new bottleneck? |
| **Days per week with zero review action taken** (missed days) | Is the human-in-the-loop step actually being used, or ignored? |

---

## 8. Suggested Tech Stack Notes

Your stack choices are reasonable — a few notes on where to keep it simple vs. where it's worth the investment:

- **Backend (FastAPI):** good fit — async support matters here since you're calling external LLM and social APIs.
- **LangChain/LangGraph:** useful once you need multi-step logic (generate → validate length → format per platform), but don't build a heavy agent graph before the simple generate-and-review loop is working end-to-end. Start with straightforward prompt calls; introduce LangGraph only if/when the flow genuinely needs branching/state.
- **RAG:** skip it for V1. With one brand and a handful of sample posts, a few-shot prompt gets you ~90% of what RAG would add, without a vector DB, embeddings pipeline, or retrieval tuning to maintain. Revisit once you have a real archive of approved posts worth retrieving from.
- **MongoDB:** fine for this — flexible schema suits varying per-platform post fields. Suggested collections: `campaigns`, `posts` (with the status field above), `platform_connections`.
- **Free LLM tier for testing:** <cite index="7-1">Google's Gemini API is a strong default, offering 1,500 requests per day on a frontier-class model with a 1M-token context window at no cost and no credit card required</cite>. <cite index="8-1">Groq is a good fast fallback for short calls, and OpenRouter is useful when you want access to many free model variants behind a single API key</cite>. Build the provider selection so it's config-driven — <cite index="2-1">free tiers change their model catalogs without warning, so a hardcoded model name is a real production risk, not a hypothetical one</cite>.
- **Publishing:** for one platform, just call that platform's native API directly — it's not worth an aggregator yet. If you plan to add several platforms soon, <cite index="10-1">Postiz is worth a look since it's the only fully open-source unified posting API and supports the widest range of platforms</cite>, and can be self-hosted to avoid recurring fees while you're still in testing phase.

---

## 9. Open Questions for You

1. Which platform should get the first real (non-manual) publishing integration — whichever the company actually posts to most often?
2. What happens on a day nobody reviews the draft — skip silently, or does someone get pinged? (V1 assumes "skip and flag," future work could add a Slack/Telegram ping.)
3. Who owns "brand voice" sign-off if more than one person ends up reviewing content?
