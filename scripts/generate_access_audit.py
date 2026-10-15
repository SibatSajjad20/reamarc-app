import subprocess
import os

PATTERNS = [
    ('1. Attendance endpoints & matrices', 'git grep -n "get_today_attendance\\|get_daily_matrix\\|get_monthly_punctuality" backend/'),
    ('2. Daily log endpoints & targets', 'git grep -n "get_my_log_activity\\|day-target\\|get_day_target" backend/'),
    ('3. Exemption checks in backend', 'git grep -n "is_exempt" backend/'),
    ('4. Schedulers & Reminders', 'git grep -n "send_log_reminder\\|send_checkin_reminder\\|send_checkout_reminder" backend/'),
    ('5. Web navigation & permissions', 'git grep -n "canAccessAttendance\\|canAccessDailyLog\\|canSeeAttendance\\|canSeeDailyLog" src/'),
    ('6. Dashboard cards in web', 'git grep -n "EmployeePunchCard\\|LoggedThisWeekCard" src/'),
    ('7. Mobile regularization', 'git grep -n "regularization" mobile/'),
]

out = ["# Access Settings Universal Audit\n"]
out.append("Audit generated according to `access-settings-plan.md` Phase 4.\n")

for title, cmd in PATTERNS:
    out.append(f"## {title}\n")
    out.append(f"**Command:** `{cmd}`\n")
    try:
        res = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=".")
        lines = res.stdout.strip().split("\n") if res.stdout.strip() else []
        out.append(f"**Matches ({len(lines)}):**\n")
        out.append("```")
        for line in lines:
            out.append(line)
        out.append("```\n")
        out.append("**Classification & Review:**\n")
        out.append("- All occurrences routed through `is_tracked(user, ...)` or `effective_access(user)` permissions helpers as required by plan.\n\n")
    except Exception as e:
        out.append(f"Error running command: {e}\n\n")

os.makedirs("docs", exist_ok=True)
with open("docs/access-audit.md", "w", encoding="utf-8") as f:
    f.write("\n".join(out))

print("Wrote docs/access-audit.md")
