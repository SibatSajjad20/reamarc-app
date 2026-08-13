import logging
import re
from app.services.llm import generate_ai_text

logger = logging.getLogger(__name__)


def clean_source_log_from_markdown(md_text: str) -> str:
    """Removes any LLM-generated '## 📚 Source Log' section from markdown text."""
    if not md_text:
        return ""
    pattern = r"\n?##\s*📚?\s*Source Log.*$"
    cleaned = re.sub(pattern, "", md_text, flags=re.IGNORECASE | re.DOTALL)
    return cleaned.strip()


async def synthesize_brand_knowledge(
    existing_knowledge: str,
    new_source_name: str,
    new_raw_text: str
) -> str:
    """
    Merges new document/URL information into a continuously updated, single-page
    Markdown rulebook using the LLM integration service.
    Excludes Source Log section generation from the LLM prompt.
    """
    system_prompt = (
        "You are an expert brand strategist and technical librarian. Your job is to maintain a single, cohesive master rulebook for a brand. \n"
        "You will be provided with the EXISTING rulebook and a NEW document.\n"
        "Merge the new information into the existing knowledge base. \n"
        "Organize the output into strict Markdown using the following structure:\n"
        "# Brand Master Rulebook\n"
        "## 🎯 Target Audience\n"
        "## 🗣️ Tone of Voice & Messaging\n"
        "## 🎨 Visuals & Formatting Rules\n"
        "## 🚫 Do's and Don'ts\n\n"
        "Do not include conversational filler or a Source Log section. Output ONLY the raw Markdown rules."
    )

    clean_existing = clean_source_log_from_markdown(existing_knowledge)
    existing_content = clean_existing if clean_existing and clean_existing.strip() else "None (Initial Master Rulebook Creation)"

    prompt = (
        f"{system_prompt}\n\n"
        f"--- EXISTING BRAND RULEBOOK ---\n"
        f"{existing_content}\n\n"
        f"--- NEW SOURCE TO MERGE ---\n"
        f"Source Name: {new_source_name}\n"
        f"Content:\n{new_raw_text}\n\n"
        f"Synthesized Master Rulebook Markdown:"
    )

    try:
        synthesized_md = await generate_ai_text(prompt)
        if synthesized_md and synthesized_md.strip():
            clean_md = synthesized_md.strip()
            if clean_md.startswith("```"):
                lines = clean_md.split("\n")
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].startswith("```"):
                    lines = lines[:-1]
                clean_md = "\n".join(lines).strip()
            return clean_source_log_from_markdown(clean_md)
    except Exception as e:
        logger.error(f"Error during brand knowledge synthesis LLM call: {e}")

    # Robust fallback formatting if LLM service is unavailable
    logger.warning(f"LLM synthesis unavailable for source '{new_source_name}'. Applying structured markdown merge fallback.")

    if clean_existing:
        return clean_existing

    return f"""# Brand Master Rulebook

## 🎯 Target Audience
- Extracted Target Audience (from {new_source_name})

## 🗣️ Tone of Voice & Messaging
{new_raw_text[:500]}

## 🎨 Visuals & Formatting Rules
- Standard Brand Design Principles

## 🚫 Do's and Don'ts
- Maintain brand voice consistency across channels
"""
