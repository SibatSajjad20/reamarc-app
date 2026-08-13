import logging
import json
from typing import Optional, List, Dict, Any
from app.config import settings

import httpx

logger = logging.getLogger(__name__)

# Supported Gemini models for tertiary fallback
PREFERRED_MODELS = [
    "gemini-2.0-flash",
    "gemini-1.5-flash",
]

_client_instance = None

def _get_genai_client():
    """Retrieve module-level singleton Client instance to avoid per-request recreation."""
    global _client_instance
    if not settings.GEMINI_API_KEY:
        return None

    if _client_instance is not None:
        return _client_instance

    try:
        from google import genai
        _client_instance = genai.Client(api_key=settings.GEMINI_API_KEY)
        return _client_instance
    except Exception as err:
        logger.warning(f"Could not initialize google-genai Client: {err}")
        return None

def _clean_json_response(raw_response: str) -> str:
    """Helper to strip markdown code fences (```json ... ```) from AI responses."""
    clean = raw_response.strip()
    if clean.startswith("```"):
        lines = clean.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        clean = "\n".join(lines).strip()
    return clean

async def _generate_openrouter_text(prompt: str) -> str:
    """Primary text completion using OpenRouter API (openrouter/free)."""
    base_url = settings.OPENROUTER_BASE_URL.rstrip('/')
    endpoint = f"{base_url}/chat/completions"
    
    headers = {
        "Content-Type": "application/json",
        "HTTP-Referer": "https://reamarc.ai",
        "X-Title": "Reamarc AI Copywriter",
    }
    if settings.OPENROUTER_API_KEY and settings.OPENROUTER_API_KEY.strip():
        headers["Authorization"] = f"Bearer {settings.OPENROUTER_API_KEY.strip()}"

    payload = {
        "model": settings.OPENROUTER_MODEL,  # openrouter/free
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.post(endpoint, headers=headers, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                choices = data.get("choices", [])
                if choices:
                    content = choices[0].get("message", {}).get("content", "")
                    if content and content.strip():
                        return content.strip()
            else:
                logger.warning(f"OpenRouter API status code {resp.status_code}: {resp.text[:200]}")
        except Exception as err:
            logger.warning(f"OpenRouter API request failed: {err}")

    return ""

async def _generate_groq_text(prompt: str) -> str:
    """Fallback text completion using Groq API (llama-3.3-70b-versatile)."""
    if not settings.GROQ_API_KEY or not settings.GROQ_API_KEY.strip():
        logger.warning("GROQ_API_KEY is not configured for fallback.")
        return ""

    headers = {
        "Authorization": f"Bearer {settings.GROQ_API_KEY.strip()}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.GROQ_MODEL,  # llama-3.3-70b-versatile
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                choices = data.get("choices", [])
                if choices:
                    content = choices[0].get("message", {}).get("content", "")
                    if content and content.strip():
                        return content.strip()
            else:
                logger.warning(f"Groq API status code {resp.status_code}: {resp.text[:200]}")
        except Exception as err:
            logger.warning(f"Groq API generation error with model {settings.GROQ_MODEL}: {err}")

    return ""

async def generate_ai_text(prompt: str) -> str:
    """
    Generate text completion asynchronously.
    Attempts primary OpenRouter API (openrouter/free) first.
    If OpenRouter reaches rate limit or fails, automatically directs request to Groq API (llama-3.3-70b-versatile).
    """
    # 1. Primary Provider: OpenRouter (openrouter/free)
    openrouter_result = await _generate_openrouter_text(prompt)
    if openrouter_result:
        return openrouter_result

    logger.info("OpenRouter primary provider rate-limited or unavailable. Directing request to Groq API fallback...")

    # 2. Fallback Provider: Groq (llama-3.3-70b-versatile)
    groq_result = await _generate_groq_text(prompt)
    if groq_result:
        return groq_result

    # 3. Tertiary Provider: Gemini (if key configured)
    if settings.GEMINI_API_KEY:
        client = _get_genai_client()
        if client:
            for model_name in PREFERRED_MODELS:
                try:
                    response = await client.aio.models.generate_content(
                        model=model_name,
                        contents=prompt,
                    )
                    if response and response.text:
                        return response.text.strip()
                except Exception as e:
                    logger.warning(f"Gemini generation error with {model_name}: {e}")
                    continue

    logger.warning("All AI providers (OpenRouter & Groq) failed to generate response.")
    return ""

def _apply_heuristic_polish(copy: str, action_type: str, platform: str = "LinkedIn") -> str:
    """Rule-based copywriting fallback when AI services are unavailable."""
    clean_copy = copy.strip()
    if action_type == "punchy":
        lines = [line.strip() for line in clean_copy.split("\n") if line.strip()]
        punchy_text = "\n\n⚡ ".join(lines)
        return f"⚡ {punchy_text}" if not punchy_text.startswith("⚡") else punchy_text
    elif action_type == "emojis":
        return f"🔥 {clean_copy}\n\n🎯✨ #HighImpact"
    elif action_type == "hashtags":
        tags = f"\n\n#B2BGrowth #ReamarcAI #ContentStrategy #{platform.replace(' ', '')}"
        if tags in clean_copy:
            return clean_copy
        return clean_copy + tags
    elif action_type == "fix":
        return clean_copy
    elif action_type == "creative_angle":
        return f"🌟 Fresh Perspective ({platform}):\n\n{clean_copy}\n\n💡 Re-imagined for maximum audience conversion."
    return clean_copy

async def polish_copy_with_gemini(copy: str, action_type: str, platform: str = "LinkedIn") -> str:
    """Polish social media copy using AI according to action_type."""
    instructions: Dict[str, str] = {
        "punchy": f"Make the following social media post copy for {platform} punchy, bold, high-converting, and engaging while keeping the key message intact.",
        "emojis": f"Add relevant modern emojis and visual formatting to this {platform} post copy to increase readability and visual weight.",
        "hashtags": f"Add 3-5 highly relevant, trending professional hashtags to the end of this {platform} post copy.",
        "fix": f"Fix all grammar, punctuation, and readability issues in this {platform} post copy.",
        "creative_angle": f"Completely rewrite this social media post for {platform} from a fresh, creative, highly engaging narrative perspective.",
    }

    instruction = instructions.get(action_type, f"Optimize this social media copy for {platform}.")
    prompt = f"{instruction}\n\nOriginal Copy:\n\"{copy}\"\n\nReturn ONLY the revised post copy text, without commentary."

    result = await generate_ai_text(prompt)
    if result and result.strip() and result.strip() != copy.strip():
        return result.strip()

    return _apply_heuristic_polish(copy, action_type, platform)

async def generate_post_from_brief(
    campaign_name: str,
    target_audience: str,
    platform: str,
    day_topic: str = "",
) -> str:
    """Generate a full social media post from a campaign brief using AI."""
    topic_line = f"\nPost Topic / Focus: \"{day_topic}\"" if day_topic.strip() else ""
    prompt = (
        f"You are an expert social media copywriter. Write a complete, high-converting {platform} post for:\n"
        f"Campaign: \"{campaign_name}\"\n"
        f"Target Audience: \"{target_audience}\""
        f"{topic_line}\n\n"
        f"Write only the post copy — no commentary, no labels, no markdown. "
        f"Match the tone and character limits appropriate for {platform}."
    )
    result = await generate_ai_text(prompt)
    if result and result.strip():
        return result.strip()

    topic_str = f"Focusing on: {day_topic}" if day_topic else "Core Strategy Highlight"
    return (
        f"🚀 {campaign_name} | {platform} Spotlight\n\n"
        f"Calling all {target_audience}!\n"
        f"{topic_str} — here is how industry leaders stay ahead.\n\n"
        f"Key Takeaways:\n"
        f"• Streamline your high-impact workflows\n"
        f"• Eliminate manual friction with automated intelligence\n"
        f"• Drive measurable conversion growth\n\n"
        f"Ready to elevate your strategy? Connect with us today!\n\n"
        f"#ContentStrategy #{platform.replace(' ', '')} #Growth"
    )

async def generate_campaign_plan_with_gemini(
    title: str,
    target_audience: str,
    tone: str,
    platforms: List[str],
    duration_days: int = 7,
    brand_context: str = ""
) -> List[dict]:
    """Generate a realistic N-day marketing strategy plan using AI."""
    platforms_list = platforms if platforms else ["LinkedIn", "Instagram"]
    platforms_str = ", ".join(platforms_list)

    brand_context_block = ""
    if brand_context.strip():
        brand_context_block = f"""
Brand Knowledge Context (use this to match the brand's exact voice, terminology, products, and style):
---
{brand_context[:8000]}
---
"""

    prompt = f"""You are a master AI content strategist. Generate a {duration_days}-day social media campaign strategy plan for:
Campaign Title: "{title}"
Target Audience: "{target_audience}"
Tone: "{tone}"
Platforms: {platforms_str}
{brand_context_block}
Return a valid JSON array of {duration_days} items, where each item has exact keys:
"day": number (1 to {duration_days})
"topic": string (concise topic title specific to "{title}")
"platform": string (one of the target platforms: {platforms_str})
"preview": string (engaging 1-2 sentence preview hook tailored to "{title}" and "{target_audience}")

Return strictly JSON format with no markdown wrappers or extra text.
"""
    raw_response = await generate_ai_text(prompt)
    if raw_response:
        try:
            clean_json = _clean_json_response(raw_response)
            parsed = json.loads(clean_json)
            if isinstance(parsed, list) and len(parsed) > 0:
                return parsed[:duration_days]
        except Exception as err:
            logger.warning(f"Could not parse AI JSON response for campaign plan: {err}")

    # Fallback plan if AI responses are empty
    topics_templates = [
        ("Exclusive Teaser & Industry Hook", "Are you a {audience} looking to transform how you approach {title}? Here is what you need to know first."),
        ("Core Value & Feature Breakdown", "Discover the key innovations behind {title} built specifically for {audience}."),
        ("Proof & Audience Success Story", "How focusing on {title} enabled leading {audience} to achieve breakthrough results in record time."),
        ("Interactive Community Q&A", "What is your biggest question regarding {title}? Let us know below and our team will answer!"),
        ("Behind the Scenes & Innovation Deep Dive", "A look inside our strategic process for {title} and how we craft solutions for {audience}."),
        ("Top Myths vs Realities", "Busting the biggest misconceptions about {title} that cost {audience} valuable growth."),
        ("Limited Call to Action & Next Steps", "Ready to take action on {title}? Connect with our strategy experts today to get started!"),
    ]

    fallback_plan = []
    for d in range(1, duration_days + 1):
        plat = platforms_list[(d - 1) % len(platforms_list)]
        template_idx = (d - 1) % len(topics_templates)
        topic_title, preview_text = topics_templates[template_idx]
        fallback_plan.append({
            "day": d,
            "topic": f"{title}: {topic_title} (Day {d})",
            "platform": plat,
            "preview": preview_text.format(title=title, audience=target_audience),
        })
    return fallback_plan

async def regenerate_asset_copy(
    asset: Dict[str, Any],
    client_feedback_text: str = "",
    brand_context: str = ""
) -> Dict[str, Any]:
    """
    Regenerates copy fields for a single matrix asset row.
    Injects a '⛔ CRITICAL CLIENT REVISION & NEGATIVE CONSTRAINTS' section at top of prompt
    to strictly enforce negative constraints (banned words/concepts).
    """
    negative_constraints_block = ""
    if client_feedback_text and client_feedback_text.strip():
        negative_constraints_block = f"""⛔ CRITICAL CLIENT REVISION & NEGATIVE CONSTRAINTS:
The client explicitly provided this feedback for this row:
"{client_feedback_text.strip()}"

STRICT RULE: You are ABSOLUTELY FORBIDDEN from using any words, phrases, or concepts rejected by the client above. (For example, if the client says "don't use quality, high-volume", you MUST NOT use the words 'quality' or 'high-volume' anywhere in your response).

"""

    brand_block = f"\nBrand Guidelines & Context:\n{brand_context.strip()}\n" if brand_context.strip() else ""

    prompt = f"""{negative_constraints_block}You are a master social media copywriter and creative director. Regenerate and polish the marketing copy for the following creative asset:

Asset Serial: {asset.get('serial', 'N/A')}
Creative Type: {asset.get('creativeType', 'Feed Post')}
Campaign Type: {asset.get('campaignType', '')}
Content Pillar: {asset.get('contentPillar', '')}
Offer: {asset.get('offer', '')}
CTA: {asset.get('cta', '')}

Current Fields:
- Content Concept: "{asset.get('contentConcept', '')}"
- Production Direction: "{asset.get('productionDirection', '')}"
- Primary Text / Caption: "{asset.get('primaryText', '')}"
- Headlines / Hooks: "{asset.get('headlinesHooks', '')}"
- Content on Creative: "{asset.get('contentOnCreative', '')}"
- Hashtags / Keywords: "{asset.get('hashtagsKeywords', '')}"
{brand_block}
INSTRUCTIONS:
1. Rewrite and elevate the copy fields (`contentConcept`, `productionDirection`, `primaryText`, `headlinesHooks`, `contentOnCreative`, `hashtagsKeywords`, `cta`) to make them fresh, engaging, and high-converting.
2. STRICT COMPLIANCE: Obey all negative constraints in the ⛔ section above. Do NOT use any banned words or forbidden concepts anywhere in your output.
3. Return strictly valid JSON format with exact keys:
"contentConcept", "productionDirection", "primaryText", "headlinesHooks", "contentOnCreative", "hashtagsKeywords", "cta"

Return ONLY the JSON object without markdown wrappers or extra text.
"""

    updated_asset = dict(asset)
    raw_response = await generate_ai_text(prompt)
    if raw_response:
        try:
            clean_json = _clean_json_response(raw_response)
            parsed = json.loads(clean_json)
            if isinstance(parsed, dict):
                for k in ["contentConcept", "productionDirection", "primaryText", "headlinesHooks", "contentOnCreative", "hashtagsKeywords", "cta"]:
                    if k in parsed and str(parsed[k]).strip():
                        updated_asset[k] = str(parsed[k]).strip()
                return updated_asset
        except Exception as err:
            logger.warning(f"Could not parse single asset JSON response: {err}")

    # Fallback polish: strip banned words if AI generation fails or returns partial data
    if client_feedback_text:
        forbidden = [w.strip() for w in client_feedback_text.lower().replace("don't use", "").replace("do not use", "").replace("no", "").split(",") if w.strip()]
        for k in ["primaryText", "headlinesHooks", "contentConcept"]:
            val = str(updated_asset.get(k, ""))
            for f_word in forbidden:
                if f_word and len(f_word) > 2:
                    val = val.replace(f_word, "").replace(f_word.capitalize(), "").replace(f_word.upper(), "")
            updated_asset[k] = val.strip()

    return updated_asset


async def generate_single_day_plan_with_gemini(
    day: int,
    title: str,
    target_audience: str,
    tone: str,
    platform: str,
    brand_context: str = "",
    client_feedback_text: str = ""
) -> dict:
    """Generate a single day plan item (topic & preview) for a campaign using AI."""
    brand_line = f"\nBrand Knowledge & Strategy Guidelines:\n{brand_context.strip()}\n" if brand_context.strip() else ""

    negative_constraints_block = ""
    if client_feedback_text and client_feedback_text.strip():
        negative_constraints_block = f"""⛔ CRITICAL CLIENT REVISION & NEGATIVE CONSTRAINTS:
The client explicitly provided this feedback for this row:
"{client_feedback_text.strip()}"

STRICT RULE: You are ABSOLUTELY FORBIDDEN from using any words, phrases, or concepts rejected by the client above. (For example, if the client says "don't use quality, high-volume", you MUST NOT use the words 'quality' or 'high-volume' anywhere in your response).

"""

    prompt = f"""{negative_constraints_block}You are an expert AI content strategist. Generate a new content topic and preview hook for Day {day} of a social media campaign:
Campaign Title: "{title}"
Target Audience: "{target_audience}"
Tone: "{tone}"
Platform: {platform}{brand_line}

Return a valid JSON object with exact keys:
"day": {day}
"topic": string (concise topic title under 60 characters)
"platform": "{platform}"
"preview": string (engaging 1-2 sentence preview hook for the post)

Return strictly JSON format with no markdown wrappers or extra text.
"""
    raw_response = await generate_ai_text(prompt)
    if raw_response:
        try:
            clean_json = _clean_json_response(raw_response)
            parsed = json.loads(clean_json)
            if isinstance(parsed, dict) and "topic" in parsed and "preview" in parsed:
                return {
                    "day": day,
                    "topic": str(parsed["topic"]).strip(),
                    "platform": platform,
                    "preview": str(parsed["preview"]).strip(),
                }
        except Exception as err:
            logger.warning(f"Could not parse single day plan item JSON: {err}")

    return {
        "day": day,
        "topic": f"Day {day}: Re-imagined Strategy Angle",
        "platform": platform,
        "preview": f"Fresh content focus targeting {target_audience} on {platform}."
    }


async def rewrite_copy_with_feedback(
    copy: str,
    feedback: str,
    preset_tags: Optional[List[str]] = None,
    platform: str = "LinkedIn",
    brand_context: str = ""
) -> str:
    """Rewrite social post copy using AI guided by reviewer feedback and preset tags."""
    tags_str = ", ".join(preset_tags) if preset_tags else "None"
    brand_block = f"\nBRAND KNOWLEDGE GUIDELINES:\n{brand_context.strip()}\n" if brand_context.strip() else ""

    prompt = f"""You are a master B2B copy director refining a social media post based on specific reviewer feedback.

TARGET PLATFORM: {platform}
{brand_block}
ORIGINAL DRAFT COPY:
\"\"\"
{copy}
\"\"\"

REVIEWER FEEDBACK & REVISION INSTRUCTIONS:
• Applied Tags: {tags_str}
• Reviewer Notes: "{feedback}"

INSTRUCTIONS:
1. Address EVERY instruction and point raised in the REVIEWER FEEDBACK & REVISION INSTRUCTIONS.
2. Incorporate the requested adjustments (tone, style, facts, call-to-action) into the post.
3. Preserve accurate facts and key value propositions from the ORIGINAL DRAFT COPY.
4. Format the final output cleanly for {platform} with appropriate line breaks and spacing.
5. Return ONLY the rewritten post copy without conversational preamble or markdown code blocks.
"""
    result = await generate_ai_text(prompt)
    if result and result.strip():
        return result.strip()

    # Rule-based fallback if AI APIs are unavailable
    clean_copy = copy.strip()
    tag_notes = f"\n\n[Revised based on tags: {tags_str}]" if preset_tags else ""
    return f"{clean_copy}\n\n📝 Reviewer Feedback Incorporated:\n\"{feedback}\"{tag_notes}"

async def generate_campaign_matrix_with_gemini(
    title: str,
    campaign_type: str = "Acquire – Cold Audience Awareness",
    target_audience: str = "General Audience",
    tone: str = "Punchy",
    offer: str = "Free Sample Pack",
    cta: str = "Request Free Sample Pack",
    pain_points: str = "",
    duration_days: int = 14,
    platforms: Optional[List[str]] = None,
    custom_prompt: str = "",
    brand_context: str = ""
) -> List[dict]:
    """
    Delegate campaign matrix generation to campaign_generator service which handles
    row-level diversity, persona adaptation, row-specific formatting, and Python duplicate validation.
    """
    from app.services.campaign_generator import generate_campaign_matrix
    return await generate_campaign_matrix(
        title=title,
        campaign_type=campaign_type,
        target_audience=target_audience,
        tone=tone,
        offer=offer,
        cta=cta,
        pain_points=pain_points,
        duration_days=duration_days,
        platforms=platforms,
        custom_prompt=custom_prompt,
        brand_context=brand_context
    )

