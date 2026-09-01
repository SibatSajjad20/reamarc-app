import os
import logging
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

VAULT_PATH = Path(os.getenv("OBSIDIAN_VAULT_PATH", "./Reamarc_Brain"))


def _clean_filename(name: str) -> str:
    """Sanitize strings for safe file paths."""
    clean = "".join([c for c in name if c.isalnum() or c in (' ', '-', '_')]).rstrip()
    return clean if clean else "unnamed_note"


def sync_daily_marketing_to_obsidian(workspace_name: str, date_str: str, summary_data: dict) -> str:
    """
    Appends a daily performance snapshot into
    `{workspace_name} Daily Marketing Reports.md` in the Obsidian vault.
    Used as a background task after daily metric upserts for long-term RAG memory.
    """
    try:
        reports_dir = VAULT_PATH / "Marketing Reports"
        reports_dir.mkdir(parents=True, exist_ok=True)

        safe_ws = _clean_filename(workspace_name)
        file_path = reports_dir / f"{safe_ws} Daily Marketing Reports.md"

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
        tag_ws = workspace_name.replace(" ", "_")

        if not file_path.exists():
            initial_content = f"""---
workspace: "{workspace_name}"
type: marketing_reports
created_at: "{now_str}"
tags: [marketing, performance, {tag_ws}]
---

# {workspace_name} — Daily Marketing Reports

## 🔗 Links
- [[{workspace_name} Brand Knowledge]]

"""
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(initial_content)

        campaign_name = summary_data.get("campaign_name", "Unknown Campaign")
        platform = summary_data.get("platform", "N/A")
        ad_spend = summary_data.get("ad_spend", 0.0)
        leads = summary_data.get("leads_conversions", 0)
        cpl = summary_data.get("cpl_cpa", 0.0)
        impressions = summary_data.get("impressions", 0)
        remarks = summary_data.get("remarks", "")

        entry = f"""
### {date_str} — {campaign_name} ({platform})
| Metric | Value |
|--------|-------|
| Ad Spend | ${ad_spend:.2f} |
| Leads/Conversions | {leads} |
| CPL/CPA | ${cpl:.2f} |
| Impressions | {impressions:,} |
| Remarks | {remarks if remarks else '—'} |

---
"""

        with open(file_path, "a", encoding="utf-8") as f:
            f.write(entry)

        logger.info(f"Appended marketing report for '{campaign_name}' ({date_str}) to {file_path}")
        return str(file_path)

    except Exception as e:
        logger.error(f"Failed to sync daily marketing report to Obsidian vault for '{workspace_name}': {e}", exc_info=True)
        return ""
