# AGENT DEVELOPMENT DIRECTIVE: STRICT SCOPE CONTAINMENT, ZERO UNINTENDED SIDE-EFFECTS & COMPLETE VERIFICATION

This document outlines the mandatory rules and verification procedures that every AI assistant, agent, and engineer **must strictly adhere to** when developing new features, fixing bugs, refactoring, or touching this codebase.

---

## 1. Strict Scope Containment (Work ONLY on What Was Requested)

When given a prompt or task (e.g., "build Sales Pipeline", "fix Daily Log date filter", "update avatar"):
1. **Establish a Bounded Blast Radius**:
   - Identify the exact files that belong exclusively to the requested feature.
   - Keep all new feature logic in dedicated files (e.g. `app/services/crm_*.py`, `app/routers/crm.py`, `src/components/crm/*`).
2. **Never Touch Unrelated Core Services**:
   - **DO NOT modify shared business logic** in core services (`attendance_service.py`, `attendance_calculator.py`, `leave_balance.py`, `security.py`, `auth.py`) unless the prompt explicitly instructs you to modify attendance, leaves, or auth.
   - If a new feature requires integration (e.g., adding a sidebar link or registering a router):
     - Make **only** the minimal surgical registration hook (e.g., `app.include_router(...)` in `main.py`, adding the view name to `App.tsx` and `Sidebar.tsx`).
     - **Do not alter or refactor any surrounding functions or existing business rules** in those entry files.
3. **Ask Before Expanding Scope**:
   - If you discover a problem in another module while working, **do not silently modify it**. Report it to the user and request permission first.

---

## 2. No Blanket Assumptions on Enums & Business Rules

1. **Distinguish Leaves vs. Active Work Arrangements**:
   - **Never lump active working arrangements into leave sets.**
   - Full-Day Absences / Off Days: `sick_leave`, `annual_leave`, `casual_leave`, `unpaid_leave`, `holiday`, `sunday_off`, `weekend_off`.
   - Active Working Arrangements: `wfh` (Work From Home), `short_leave` (partial day departure while working remaining hours), `office`, `night_shift`.
   - Employees on `wfh` **must always be allowed to check in, punch in, and check out**.
2. **Explicit Set Members**:
   - When defining locking sets (like `LEAVE_LOCK_STATUSES` or `EXCLUDED_STATUSES`), explicitly justify every single item. Never blindly copy enum values or use blanket comprehensions.

---

## 3. Mandatory Dual-Condition Testing

Whenever writing or modifying validation, security gates, or status locks:
1. **Test the Negative Case**: Verify that invalid or locked states are properly rejected with the correct HTTP status code and message.
2. **Test the Positive Case**: Verify that all legitimate cases (especially **WFH**, normal office punches, night shifts, and different employee roles) pass without interruption.
3. **Test Realistic Data States**: Never assume a database collection is empty. Always test behavior when placeholder/pre-created documents exist (e.g., an unpunched record with `status: 'wfh'`).

---

## 4. End-of-Development Verification Checklist (Mandatory Before Delivery)

Every agent must execute the following 5-step checklist before finishing, committing, or reporting completion to the user:

### Step 1: Git Diff & Blast Radius Audit
Run:
```bash
git status
git diff --stat
```
Inspect every modified file:
- Is this file strictly required for the user's task?
- Did any unexpected or unrelated file get modified?
- If an unrelated file was modified, **revert it immediately**:
  ```bash
  git checkout -- <file>
  ```

### Step 2: Clean Up Scratch & Temporary Artifacts
Ensure no temporary test scripts, scratch files, or unwanted dumps are left in working directories.

### Step 3: Run Automated Test Suites
Run the backend and frontend test suites for the affected areas:
```bash
# Check all leave and attendance flows pass
python -m unittest tests.test_leave_override_quotas
python -m unittest tests.test_web_and_mobile_punch_flows
```
Ensure all tests exit with `OK` and zero failures.

### Step 4: Live Sanity Verification
Confirm that existing core operations still work:
- Check-in / check-out endpoints respond as expected.
- Existing user authentication and timesheets remain fully intact.
- Both Web and Mobile APIs remain compatible.

### Step 5: Update the Knowledge Graph
Whenever code files are modified, run:
```bash
graphify update .
```
This updates the AST knowledge graph (`graphify-out/`) with no API cost.

---

## Summary Rule for Agents
> **"Touch only what was requested, test both what was added and what was left untouched, verify with `git diff --stat` before finishing, and leave the system in 100% working condition."**
