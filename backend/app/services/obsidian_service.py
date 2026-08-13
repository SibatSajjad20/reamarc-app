import os
import re
import threading
import logging
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, Optional, List
from dotenv import load_dotenv

# Force Python to read the .env file right now
load_dotenv()

logger = logging.getLogger(__name__)

# Load the vault path from environment variables
VAULT_PATH = Path(os.getenv("OBSIDIAN_VAULT_PATH", "./Reamarc_Brain"))

_file_locks: Dict[str, threading.Lock] = {}
_file_locks_guard = threading.Lock()


def _get_file_lock(file_path: Path) -> threading.Lock:
    key = str(file_path.resolve())
    with _file_locks_guard:
        if key not in _file_locks:
            _file_locks[key] = threading.Lock()
        return _file_locks[key]


def extract_source_log(content: str) -> List[str]:
    """Extracts bulleted items under '## 📚 Source Log' from markdown content."""
    if not content:
        return []
    match = re.search(r"##\s*📚?\s*Source Log\s*\n(.*)", content, re.DOTALL | re.IGNORECASE)
    if not match:
        return []
    log_section = match.group(1)
    sources: List[str] = []
    for line in log_section.splitlines():
        line_str = line.strip()
        if not line_str:
            continue
        if line_str.startswith("##"):
            break
        clean_item = re.sub(r"^[-*+]\s*|^\d+\.\s*", "", line_str).strip()
        if clean_item and clean_item not in sources:
            sources.append(clean_item)
    return sources


def clean_source_log_from_markdown(md_text: str) -> str:
    """Removes any '## 📚 Source Log' section from markdown text."""
    if not md_text:
        return ""
    pattern = r"\n?##\s*📚?\s*Source Log.*$"
    cleaned = re.sub(pattern, "", md_text, flags=re.IGNORECASE | re.DOTALL)
    return cleaned.strip()


def _clean_filename(name: str) -> str:
    """Sanitize strings for safe file paths."""
    clean = "".join([c for c in name if c.isalnum() or c in (' ', '-', '_')]).rstrip()
    return clean if clean else "unnamed_note"


def sync_campaign_to_obsidian(asset: Dict[str, Any], workspace_name: str = "Main Workspace") -> str:
    """
    Overwrites/updates the campaign `.md` file whenever a matrix row is created, edited, or regenerated.
    Includes double-bracket wikilinks: [[{workspace_name} Brand Knowledge]] and [[Client Notes - {workspace_name}]].
    Handles all dictionary structures safely with try/except.
    """
    campaign_title = "Campaign Asset"
    serial = ""
    try:
        # Extract details from asset dictionary or post dictionary
        campaign_title = (
            asset.get("campaign")
            or asset.get("_campaignTitle")
            or asset.get("campaign_name")
            or asset.get("title")
            or "Campaign Asset"
        )
        serial = asset.get("serial") or asset.get("id") or ""
        concept = (
            asset.get("contentConcept")
            or asset.get("pillar")
            or asset.get("creativeType")
            or asset.get("concept")
            or asset.get("targetAudience")
            or ""
        )
        copy = (
            asset.get("primaryText")
            or asset.get("scriptOutline")
            or asset.get("primaryCopy")
            or asset.get("copy")
            or asset.get("notes")
            or ""
        )
        status = asset.get("approvalStatus") or asset.get("status") or "Draft"
        creative_type = asset.get("creativeType") or asset.get("platform") or "General"
        offer = asset.get("offer") or ""
        cta = asset.get("cta") or ""

        # Ensure Campaigns folder exists
        campaign_dir = VAULT_PATH / "Campaigns"
        campaign_dir.mkdir(parents=True, exist_ok=True)

        file_title = f"{campaign_title} {serial}".strip()
        safe_name = _clean_filename(file_title)
        file_path = campaign_dir / f"{safe_name}.md"

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
        tag_ws = workspace_name.replace(" ", "_")

        markdown_content = f"""---
campaign: "{campaign_title}"
serial: "{serial}"
workspace: "{workspace_name}"
status: "{status}"
creative_type: "{creative_type}"
date_synced: "{now_str}"
tags: [campaign, {tag_ws}]
---

# {file_title}

## 🧠 Content Concept
{concept}

## 🎯 Offer & CTA
- **Offer**: {offer if offer else 'N/A'}
- **CTA**: {cta if cta else 'N/A'}

## ✍️ Creative Copy
{copy}

## 🔗 Links
- [[{workspace_name} Brand Knowledge]]
- [[Client Notes - {workspace_name}]]
"""

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(markdown_content)

        logger.info(f"✨ Obsidian Sync Success: Saved note to {file_path}")
        return str(file_path)

    except Exception as e:
        logger.error(
            f"❌ Failed to sync campaign note to Obsidian vault (file_title='{campaign_title}', serial='{serial}'): {e}",
            exc_info=True
        )
        return ""


def save_campaign_to_obsidian(
    campaign_name: str,
    workspace_name: str,
    content_concept: str,
    creative_copy: str,
    status: str
) -> str:
    """
    Backwards-compatible wrapper that calls sync_campaign_to_obsidian.
    """
    asset = {
        "campaign": campaign_name,
        "contentConcept": content_concept,
        "primaryText": creative_copy,
        "approvalStatus": status
    }
    return sync_campaign_to_obsidian(asset=asset, workspace_name=workspace_name)


def append_client_note(workspace_name: str, campaign_name: str, revision_notes: str) -> str:
    """
    Targets the `Client Notes - {workspace_name}.md` file.
    If the file doesn't exist, creates it.
    Appends a time-stamped log of the client's feedback.
    """
    try:
        notes_dir = VAULT_PATH / "Client Notes"
        notes_dir.mkdir(parents=True, exist_ok=True)

        safe_ws = _clean_filename(workspace_name)
        file_path = notes_dir / f"Client Notes - {safe_ws}.md"

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
        tag_ws = workspace_name.replace(" ", "_")

        if not file_path.exists():
            initial_content = f"""---
workspace: "{workspace_name}"
type: client_notes
created_at: "{now_str}"
tags: [client_notes, {tag_ws}]
---

# Client Notes - {workspace_name}

## 📝 Feedback & Revision History
"""
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(initial_content)

        log_entry = f"\n### {now_str} - {campaign_name}\n{revision_notes}\n"

        with open(file_path, "a", encoding="utf-8") as f:
            f.write(log_entry)

        logger.info(f"📝 Appended client note to {file_path}")
        return str(file_path)

    except Exception as e:
        logger.error(f"❌ Failed to append client note to Obsidian vault for workspace '{workspace_name}': {e}", exc_info=True)
        return ""


def get_existing_brand_knowledge(workspace_name: str) -> str:
    """
    Checks if `{workspace_name} Brand Knowledge.md` exists in the Obsidian vault.
    If yes, reads and returns the content. If no, returns an empty string.
    """
    try:
        safe_ws = _clean_filename(workspace_name)
        file_path = VAULT_PATH / "Brand Knowledge" / f"{safe_ws} Brand Knowledge.md"
        if file_path.exists():
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()
    except Exception as e:
        logger.warning(f"Failed to read brand knowledge for '{workspace_name}' from Obsidian vault: {e}")
    return ""


def overwrite_brand_knowledge(workspace_name: str, synthesized_markdown: str, new_source_name: Optional[str] = None) -> str:
    """
    Overwrites the `{workspace_name} Brand Knowledge.md` file with newly generated Markdown.
    Deterministically manages the '## 📚 Source Log' section at the end of the file.
    """
    try:
        bk_dir = VAULT_PATH / "Brand Knowledge"
        bk_dir.mkdir(parents=True, exist_ok=True)

        safe_ws = _clean_filename(workspace_name)
        file_path = bk_dir / f"{safe_ws} Brand Knowledge.md"
        lock = _get_file_lock(file_path)

        with lock:
            existing_sources: List[str] = []
            if file_path.exists():
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        existing_content = f.read()
                        existing_sources = extract_source_log(existing_content)
                except Exception as read_err:
                    logger.warning(f"Could not read existing brand knowledge for source log extraction: {read_err}")

            clean_markdown = clean_source_log_from_markdown(synthesized_markdown)

            sources_list = list(existing_sources)
            if new_source_name and new_source_name.strip():
                clean_new_src = new_source_name.strip()
                if clean_new_src not in sources_list:
                    sources_list.append(clean_new_src)

            source_log_lines = ["## 📚 Source Log"]
            for src in sources_list:
                source_log_lines.append(f"- {src}")
            source_log_str = "\n".join(source_log_lines)

            if clean_markdown:
                final_content = f"{clean_markdown}\n\n{source_log_str}\n"
            else:
                final_content = f"{source_log_str}\n"

            with open(file_path, "w", encoding="utf-8") as f:
                f.write(final_content)

        logger.info(f"✨ Successfully overwritten Brand Knowledge master rulebook at {file_path}")
        return str(file_path)
    except Exception as e:
        logger.error(f"❌ Failed to overwrite brand knowledge in Obsidian vault for '{workspace_name}': {e}", exc_info=True)
        return ""


def sync_brand_knowledge_to_obsidian(workspace_name: str, source_name: str, extracted_text: str) -> str:
    """
    Targets a file named `Brand Knowledge/{workspace_name} Brand Knowledge.md`.
    If the file does not exist, creates it with YAML frontmatter.
    Appends extracted knowledge content under a header indicating the source name and date.
    """
    try:
        bk_dir = VAULT_PATH / "Brand Knowledge"
        bk_dir.mkdir(parents=True, exist_ok=True)

        safe_ws = _clean_filename(workspace_name)
        file_path = bk_dir / f"{safe_ws} Brand Knowledge.md"

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
        tag_ws = workspace_name.replace(" ", "_")

        if not file_path.exists():
            initial_content = f"""---
workspace: "{workspace_name}"
type: brand_knowledge
created_at: "{now_str}"
tags: [brand_knowledge, {tag_ws}]
---

# {workspace_name} Brand Knowledge

## 🔗 Links
- [[Client Notes - {workspace_name}]]

"""
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(initial_content)

        entry = f"""
## Source: {source_name} (Added: {now_str})
{extracted_text.strip()}

---
"""

        with open(file_path, "a", encoding="utf-8") as f:
            f.write(entry)

        logger.info(f"📚 Appended Brand Knowledge source '{source_name}' to {file_path}")
        return str(file_path)

    except Exception as e:
        logger.error(f"❌ Failed to sync brand knowledge to Obsidian vault for '{workspace_name}': {e}", exc_info=True)
        return ""


def update_brand_guidelines(workspace_name: str, guidelines_text: str) -> str:
    """
    Wrapper for brand guidelines text updates, redirecting to sync_brand_knowledge_to_obsidian.
    """
    return sync_brand_knowledge_to_obsidian(
        workspace_name=workspace_name,
        source_name="Workspace Guidelines Settings",
        extracted_text=guidelines_text
    )


def read_brand_guidelines(workspace_name: str) -> str:
    """
    Reads an Obsidian note to inject into an LLM prompt.
    """
    content = get_existing_brand_knowledge(workspace_name)
    return content if content else "No brand knowledge found."


def read_client_notes(workspace_name: str) -> str:
    """
    Reads the `Client Notes - {workspace_name}.md` note from the Obsidian vault.
    Returns the markdown string content or empty string if not found.
    """
    try:
        cn_dir = VAULT_PATH / "Client Notes"
        safe_ws = _clean_filename(workspace_name)
        file_path = cn_dir / f"Client Notes - {safe_ws}.md"

        if file_path.exists():
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read().strip()
    except Exception as e:
        logger.error(f"❌ Failed to read client notes from Obsidian for '{workspace_name}': {e}", exc_info=True)
    return ""


def extract_client_feedback_for_asset(client_notes_md: str, asset_id: str = "", serial: str = "") -> str:
    """
    Parses `client_notes_md` from Obsidian vault to extract feedback entries associated
    with `asset_id` or `serial` (e.g., 'AC-001'), or general workspace feedback.
    """
    if not client_notes_md or not client_notes_md.strip():
        return ""

    lines = client_notes_md.split("\n")
    current_entry = []
    match_found = False
    specific_entries = []
    all_entries = []

    for line in lines:
        if line.startswith("### "):
            if current_entry:
                entry_text = "\n".join(current_entry).strip()
                all_entries.append(entry_text)
                if match_found:
                    specific_entries.append(entry_text)
            current_entry = [line]
            match_found = False
            if (serial and serial.lower() in line.lower()) or (asset_id and asset_id.lower() in line.lower()):
                match_found = True
        else:
            if current_entry:
                current_entry.append(line)
                if (serial and serial.lower() in line.lower()) or (asset_id and asset_id.lower() in line.lower()):
                    match_found = True

    if current_entry:
        entry_text = "\n".join(current_entry).strip()
        all_entries.append(entry_text)
        if match_found:
            specific_entries.append(entry_text)

    if specific_entries:
        return "\n\n".join(specific_entries)
    elif all_entries:
        return "\n\n".join(all_entries)
    else:
        return client_notes_md.strip()



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

        logger.info(f"📊 Appended marketing report for '{campaign_name}' ({date_str}) to {file_path}")
        return str(file_path)

    except Exception as e:
        logger.error(f"❌ Failed to sync daily marketing report to Obsidian vault for '{workspace_name}': {e}", exc_info=True)
        return ""

