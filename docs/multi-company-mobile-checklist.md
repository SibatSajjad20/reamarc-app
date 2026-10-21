# Multi-Company Mobile & Web Switcher Verification Checklist

This document details the test procedures, verification points, and QA sign-off criteria for multi-company memberships, token management, session handling, cache eviction, and notifications across Mobile (React Native / Expo) and Web (React / TypeScript).

---

## 1. Prerequisites & Environment
- **Target Database:** `reamarc_test_db` for local testing. Production `reamarc_db` must **NEVER** be used for testing.
- **Backend Configuration:**
  - `MULTI_COMPANY_ENABLED=True` (set in `backend/.env` or runtime settings).
  - Seed users and companies created via migrations or owner console.
- **Accounts for Verification:**
  - **User U (Dual-company):** Member in Company A (e.g. Role: Admin) and Company B (e.g. Role: Team Member).
  - **User W (Single-company):** Admin of Company A only.
  - **User X (Single-company):** Admin of Company B only.
  - **Owner O:** Platform Owner (`is_super_admin: true` / `role: owner`).

---

## 2. Web Switcher Verification Checklist

### 2.1 Brand Block & Switcher UI
- [ ] Log in as User U on web (`/login`).
- [ ] Observe the Sidebar top brand block:
  - Displays Company A logo / name.
  - Subtitle shows User U's active role in Company A (`Admin`) rather than a static string.
  - Clicking the brand block opens the company switcher dropdown.
- [ ] Switcher Dropdown inspection:
  - Lists all active companies belonging to User U (Company A and Company B).
  - Current active company has a checkmark (`✓`).
  - Each item displays the company logo/initials, name, and user's role in that company.
  - If logged in as Owner O, an "Owner console" link is displayed at the bottom of the dropdown. For non-owners, this link is never rendered.

### 2.2 Switch Execution & Cache Invalidation
- [ ] In the switcher dropdown, click on Company B:
  - System calls `POST /api/v1/auth/switch-company` with payload `{"company_id": "<Company B ID>"}`.
  - New JWT access and refresh tokens are issued for Company B (claims: `cid=<Company B ID>`, `mid=<Company B Membership ID>`).
  - User's `last_company_id` is updated on backend.
  - LocalStorage application caches are cleared: keys starting with `cache_`, `cc_`, `dash_`, `reamarc_cache_`.
  - Content calendar and module caches are evicted.
  - User is navigated to `/dashboard` with Company B theme, permissions, and data.
  - Cross-tab broadcast: `BroadcastChannel('reamarc_company_switch')` posts an update; any open tabs in the same browser automatically reload and sync to Company B.

### 2.3 Deep Link Switch via Web Push Notifications
- [ ] Send a web push notification tagged with Company B (`?switch=<Company B ID>`).
- [ ] Click notification while active in Company A:
  - `public/sw.js` opens window with query parameter `?switch=<Company B ID>`.
  - `AuthContext` detects `switch` URL search param, calls `switchCompany(targetCid)`, and navigates to target screen.

---

## 3. Mobile (React Native / Expo) Checklist

### 3.1 Session Startup & Active Membership
- [ ] Open Mobile App.
- [ ] Log in with User U credentials:
  - `POST /api/v1/auth/login` returns access & refresh tokens containing `cid`, `mid`, `mtv`.
  - Secure storage persists `access_token` and `refresh_token`.
  - `saveCachedUser(data.user)` stores profile including `companies: [...]`.
  - App opens default active company (Company A).

### 3.2 Mobile Profile Switcher
- [ ] Navigate to the **Profile** tab:
  - "Switch Company" section is rendered when `user.companies.length > 1`.
  - Active company is displayed with an active badge / checkmark (`checkmark-circle`).
  - Other available companies are listed with their corresponding roles.
- [ ] Tap on Company B:
  - Small loading indicator activates while switching.
  - `clearAttendanceCaches()` is executed:
    - Evicts cached attendance punch status (`todayPunch`).
    - Evicts cached matrix (`attendanceMatrix`).
    - Clears stale cache timestamp.
  - `clearDailyLogCaches()` is executed:
    - Evicts offline daily log drafts, date mappings, and today's status.
  - `clearCrmCaches()` is executed:
    - Evicts lead cache, workspace caches, and pipeline filters.
  - `POST /api/v1/auth/switch-company` receives new tokens.
  - Tokens and new cached user profile are stored in `expo-secure-store`.
  - Push token is re-registered with the new active company context.
  - Tab navigation updates: e.g. Overview/Punch tab reflects Company B attendance rules; pipeline tab reflects Company B CRM access.

### 3.3 Offline & Revalidation Safety
- [ ] Turn off device network connection (Airplane Mode).
- [ ] Relaunch mobile app:
  - `loadPersistedSession()` reads cached session and displays cached user profile without crash.
  - User is NOT logged out prematurely.
- [ ] Restore network:
  - Profile silently revalidates against `/api/v1/auth/me`.

---

## 4. Privacy & Anti-Leakage Verification Checklist

### 4.1 Cross-Company Privacy (Admin Directory)
- [ ] Log in as Admin W (Company A admin):
  - View Team Directory (`/admin/members`): User U appears with role `admin`.
  - Inspect network responses: zero occurrences of Company B's ID, slug, or name.
  - Inspect DOM: zero text or badges mentioning Company B.
- [ ] Log in as Admin X (Company B admin):
  - View Team Directory (`/admin/members`): User U appears with role `team_member`.
  - Inspect network responses: zero occurrences of Company A's ID, slug, or name.
  - Inspect DOM: zero text or badges mentioning Company A.

### 4.2 Probed Email Leaks Blocked
- [ ] As Admin W, attempt to invite or create a user with an email already belonging to Company B:
  - Endpoint returns `403 Forbidden` (`{"detail": "Member creation is managed via Platform Owner console."}`).
  - Error message does NOT state "Email already exists in Company B".

---

## 5. Security & Revocation Checklist

### 5.1 Owner Revocation Isolation
- [ ] Platform Owner O logs into `/owner` -> **Members** tab.
- [ ] Owner removes User U from Company B (`POST /owner/members/{uid}/companies/{cid}/remove`):
  - Membership status changes to `status: "removed"`.
  - `token_version` on Company B membership is incremented.
  - All existing check-ins and activity logs in Company B remain preserved in the database (no deletion).
- [ ] Test User U with Company B token:
  - Calling `/api/v1/auth/me` returns `401 Unauthorized`.
- [ ] Test User U with Company A token:
  - Calling `/api/v1/auth/me` returns `200 OK` (Company A session is unaffected).
- [ ] In Mobile Switcher, Company B no longer appears in User U's available companies.

### 5.2 Token Tampering & Rate Limiting
- [ ] Manually forge JWT claims:
  - Tamper with `cid` or `mid` -> returns `401 Unauthorized`.
  - Tamper with `mtv` (mismatched version) -> returns `401 Unauthorized`.
- [ ] Perform rapid successive company switches (12 requests in 30 seconds):
  - 11th request triggers `429 Too Many Requests`.

---

## 6. Automated Test Suites Sign-off
Run the full test suite before shipping:
```bash
# 1. Tenancy Base Suite
$env:PYTHONPATH=".;backend"; python -m unittest tests.tenancy.test_auth_tenancy

# 2. Phase 2 Switching Suite
$env:PYTHONPATH=".;backend"; python -m unittest tests.tenancy.test_phase2_multi_company

# 3. Phase 3 Owner Suite
$env:PYTHONPATH=".;backend"; python -m unittest tests.tenancy.test_phase3_owner_members

# 4. Phase 4 Per-Company Tracking Suite
$env:PYTHONPATH=".;backend"; python -m unittest tests.tenancy.test_phase4_per_company_tracking

# 5. Phase 5 Comprehensive Privacy & Route Suite
$env:PYTHONPATH=".;backend"; python -m unittest tests.tenancy.test_phase5_privacy_and_routes

# 6. Mobile Unit Suites
node --test mobile/src/lib/sessionCodec.test.ts mobile/src/lib/cacheClearing.test.ts

# 7. Typecheck & Build
npx tsc --noEmit
cd mobile; npx tsc --noEmit
```
All checks must exit code `0` with 0 failures and 0 warnings.
