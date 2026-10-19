# Perf round 1 summary

Branch: `perf/round1` from `feat/multi-company` `87e448e`.

WIP on `feat/multi-company` was stashed as `wip-before-perf-round1` before this branch was created. Restore it with `git stash pop` after switching back.

The `/workspace/reamarc-audit/perf-overall` toolkit is not on this machine, so Phase 0 / Gate 1 endpoint and page timings were not recorded against `time_api.py`, `seed_perf.py`, or the 100 ms latency proxy. Local mongod on `localhost:27017` was used only for pytest. Atlas was not contacted.

## Before (from perf-review.md)

| Surface | Review number |
|---|---|
| Admin dashboard PK | 6.37 s / 5.1 MB |
| Content calendar PK | 6.19 s / 5.0 MB |
| Member dashboard | 3.9 s / 21 requests |
| Exceptions inbox @100 ms | 1,252 ms |

## After Phase 1 (this machine)

| Metric | Before (review) | After (this round) |
|---|---|---|
| Admin dashboard PK | 6.37 s / 5.1 MB | **not timed** (toolkit missing) |
| Member dashboard request count | 21 | Overdue calendar list removed; week day-targets are 1 range call instead of 7–8 |
| Content calendar JSON gzip | uncompressed | `GZipMiddleware` enabled (`minimum_size=1000`) |
| Main JS raw | (review) | 2,086.52 kB (`index-CHqiFPOO.js`) |
| Main JS gzip | | 512.50 kB |
| xlsx chunk | in main | 492.49 kB raw / 160.52 kB gzip (`xlsx-CIWsbm6w.js`) |
| Auth `users.find({id})` | COLLSCAN on miss of partial unique | non-unique `idx_users_id` added |

Local/100 ms/PK columns for every review row could not be filled without `time_api.py` / `page_timing.py`.

## Command counts (pytest, local mongod)

- Overdue-summary: 0 writes on a warm request; command count still includes auth and index noise on this process.
- Day-targets range: matches 7 single `expected_hours` values for a seeded member.

## What landed (commits)

| Commit | Item |
|---|---|
| `perf(Q1)` | `GET /content-calendar/overdue-summary`; dashboard uses it; website tasks `?overdue=true` |
| `perf(Q2)` | `GZipMiddleware`; `/health` pings `db_instance.client.admin` |
| `perf(Q3)` | `idx_users_id` + hot indexes; auth membership/company `asyncio.gather`; 300 s company cache |
| `perf(Q4)` | `verify_password_async` / `get_password_hash_async` in `auth.py`; Cloudinary and PIL size in `to_thread` |
| `perf(Q5)` | `GET /daily-log/day-targets?from&to`; dashboard week + today |
| `perf(Q6)` | CORS `max_age=7200`; JSON `Content-Type` only when there is a body |
| `perf(Q7)`+`perf(Q8)` | CRM invalidation `source` so CrmView skips its own full reload; parallel CRM count/find, lead+deals, assign |
| `perf(Q9)` | dynamic `import('xlsx')` |

Q7 and Q8 landed in one commit (`perf(Q8)`) because of a git index lock.

## Tests added

- `tests/perf/conftest.py` and `backend/tests/perf/conftest.py` — Mongo `CommandListener`
- `tests/perf/test_q1_overdue_summary.py`
- `tests/perf/test_q2_gzip.py`
- `tests/perf/test_q3_indexes.py`
- `tests/perf/test_q5_day_targets.py`
- `src/components/views/DashboardView.overdue.test.ts`
- `src/utils/cacheBus.source.test.ts`
- `src/services/apiClient.headers.test.ts`

Gate: `py -3 -m pytest tests/perf` — 8 passed. `npx tsc -b`, `npm run lint`, `npm run build` passed.

`pytest tests -q` still collects ignored round-2 files under `tests/tenancy` (for example `test_r9_wrapper_startup.py`) that are not on this branch’s tracked set.

## Left for after round 2 (R3)

These still use sync `get_password_hash` as required:

- `backend/app/routers/admin.py` (~create member / password update)
- `backend/app/routers/owner.py` (~create company admin / password)

## Phase 2 not started

B1 content-calendar window/lean/fields, B2 route splitting, B3 sequential DB collapse, B4 CRM cursor+virtual, B5 URL view, B6 same-origin flag, B7 TanStack Query (explicitly later).

Main bundle is still ~2.1 MB because B2 did not run. Q9 already split `xlsx`.

## [Faizan runs]

1. Confirm Render and Atlas regions; ping from Pakistan.
2. Co-locate Render + Atlas in Singapore; dump/restore; switch `MONGODB_URL` / `VITE_API_URL` / `vercel.json`.
3. On Standard: `gunicorn -k uvicorn.workers.UvicornWorker -w 2` with schedulers on one worker only (`RUN_SCHEDULERS`). Do not add this until the flag exists.
4. External keep-alive on `/health` every 10 minutes until paid Render. `/health` now pings the raw client.
5. Vercel Pro for commercial use.
6. After deploy: `curl -H 'Accept-Encoding: gzip' -sI` on `/api/v1/content-calendar?limit=1000` and re-time dashboard / CRM / CC from Pakistan.
7. B6 same-origin rewrite experiment on a Vercel preview: switch prod only if p50 through the rewrite is ≤ direct + 30 ms.
