# Access Settings Architecture & Guide

> [!NOTE]
> Supersedes legacy role prompt specifications (`hardcoded-roles-prompt.md`) with a unified, database-backed access engine in `backend/app/services/access.py` and front-end interface in `Settings > Access`.

## Overview
Access control in the application is governed by 6 binary switches per user, backed by role and department defaults:
1. **Attendance** (`attendance`): Controls shift check-in/out, biometric/geofence verification, matrix headcount, timesheets, and reminders.
2. **Daily log** (`daily_log`): Controls daily work log submissions, day targets, team hours, log compliance scoring, and missed log reminders.
3. **Sales pipeline** (`sales`): Access to CRM leads, deals, follow-ups, and won-deal approvals.
4. **Content calendar** (`content_calendar`): Access to calendar schedule, plus granular content workflow stages.
5. **Website pipeline** (`website`): Access to client website projects, task boards, and milestones.
6. **Performance marketing** (`ads`): Access to advertising campaigns and ad account workspaces.

---

## Defaults Matrix

| Role | Primary Department | Attendance | Daily Log | Sales | Content Calendar | Website | Ads | Primary Stage | Notes |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Admin** | Any | OFF | OFF | ON | ON | ON | ON | All | Untracked for attendance/logs; full view/manage across all modules. |
| **Operations** | Any | ON | OFF | ON (view) | ON (view) | ON (view) | ON (view) | All | Tracked for attendance only; won-deal approval capability. |
| **HR** | Any | ON | ON | OFF | OFF | OFF | OFF | — | Tracked for attendance and daily log; manages leaves, matrix, compliance. |
| **Team Lead / Member** | Sales | OFF | OFF | ON | OFF | OFF | OFF | — | Tracked only for CRM. |
| **Team Lead / Member** | Content | ON | ON | OFF | ON | OFF | OFF | Content | Full attendance/log tracking; content calendar access. |
| **Team Lead / Member** | Creative | ON | ON | OFF | ON | OFF | OFF | Creative | Full attendance/log tracking; creative production stage. |
| **Team Lead / Member** | Social Media | ON | ON | OFF | ON | OFF | OFF | Social | Full attendance/log tracking; social media stage. |
| **Team Lead / Member** | Website / Dev | ON | ON | OFF | OFF | ON | OFF | — | Full attendance/log tracking; website pipeline access. |
| **Team Lead / Member** | Marketing / Ads| ON | ON | OFF | OFF | OFF | ON | — | Full attendance/log tracking; ad campaigns access. |
| **Client** | Any | OFF | OFF | OFF | OFF | OFF | OFF | — | Portal access only; internal workspace hidden. |

---

## How to Change Access

### 1. Per-User Toggles (Settings > Access)
1. Navigate to **Settings > Access** (available exclusively to Admins).
2. Use the search bar or Role/Department filters to locate the team member.
3. Click any switch in the user's row to toggle the setting ON or OFF.
   - When a setting differs from the default, a violet accent dot is shown beside the switch.
   - An optimistic toggle is dispatched to the backend (`PATCH /api/v1/access/{user_id}`).

### 2. Content Calendar Stages Popover
1. For any user with Content Calendar turned ON, click the **Stages** button.
2. The user's primary department stage is locked and permanently checked.
3. Check or uncheck additional stages (Content, Creative, Social media) to grant multi-stage visibility without altering their primary department or daily log expectations.

### 3. Reset to Default
- **Per Cell:** Hover over any customized switch and click the "Reset to default" link.
- **Per Row:** Click the row menu `...` on the far right and select "Reset to defaults".
- Resetting sets the stored override to `null`, returning the user to their department/role baseline.

### 4. Bulk Department/Role Actions
1. Click the dropdown menu in any column header (e.g. Attendance, Daily Log).
2. Choose **"Apply ON to all `<dept> <role>`"** or **"Apply OFF to all `<dept> <role>`"**.
3. Confirm the action in the prompt showing the affected user count.
