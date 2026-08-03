import google.generativeai as genai
from app.config import settings
import logging
import json

logger = logging.getLogger(__name__)

# List of supported models to attempt in order
PREFERRED_MODELS = [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3-flash-preview",
    "gemini-2.0-flash",
    "gemini-flash-latest"
]

def _get_generative_model():
    if not settings.GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not provided in configuration.")
        return None
    
    genai.configure(api_key=settings.GEMINI_API_KEY)
    
    for model_name in PREFERRED_MODELS:
        try:
            return genai.GenerativeModel(model_name)
        except Exception as err:
            logger.debug(f"Model {model_name} setup error: {err}")
            continue
    return None

async def generate_ai_text(prompt: str) -> str:
    """Generate raw text completion using Gemini AI."""
    model = _get_generative_model()
    if not model:
        return ""
    
    for model_name in PREFERRED_MODELS:
        try:
            m = genai.GenerativeModel(model_name)
            res = m.generate_content(prompt)
            if res and res.text:
                return res.text.strip()
        except Exception as e:
            logger.warning(f"Gemini generation error with {model_name}: {e}")
            continue
    return ""

async def polish_copy_with_gemini(copy: str, action_type: str, platform: str = "LinkedIn") -> str:
    """Polish social media copy using Gemini AI according to action_type."""
    if not settings.GEMINI_API_KEY:
        # Fallback local heuristics if key is missing
        if action_type == "punchy":
            return copy.replace("\n\n", " ⚡\n").replace("check out", "master")
        elif action_type == "emojis":
            return f"🔥 {copy} 🎯✨"
        elif action_type == "hashtags":
            return copy + f"\n\n#B2BGrowth #ReamarcAI #ContentStrategy #{platform}"
        elif action_type == "fix":
            return copy.strip()
        return copy

    instructions = {
        "punchy": f"Make the following social media post copy for {platform} punchy, bold, high-converting, and engaging while keeping the key message intact.",
        "emojis": f"Add relevant modern emojis and visual formatting to this {platform} post copy to increase readability and visual weight.",
        "hashtags": f"Add 3-5 highly relevant, trending professional hashtags to the end of this {platform} post copy.",
        "fix": f"Fix all grammar, punctuation, and readability issues in this {platform} post copy."
    }

    instruction = instructions.get(action_type, f"Optimize this social media copy for {platform}.")
    prompt = f"{instruction}\n\nOriginal Copy:\n\"{copy}\"\n\nReturn ONLY the revised post copy text, without commentary."

    result = await generate_ai_text(prompt)
    return result if result else copy

async def generate_campaign_plan_with_gemini(title: str, target_audience: str, tone: str, platforms: list[str]) -> list[dict]:
    """Generate a realistic 7-day marketing strategy plan using Gemini AI."""
    if not settings.GEMINI_API_KEY:
        return []

    platforms_str = ", ".join(platforms) if platforms else "LinkedIn, Instagram"
    prompt = f"""You are a master AI content strategist. Generate a 7-day social media campaign strategy plan for:
Campaign Title: "{title}"
Target Audience: "{target_audience}"
Tone: "{tone}"
Platforms: {platforms_str}

Return a valid JSON array of 7 items, where each item has exact keys:
"day": number (1 to 7)
"topic": string (concise topic title)
"platform": string (one of the target platforms)
"preview": string (engaging 1-2 sentence preview hook for the post)

Return strictly JSON format with no markdown wrappers or extra text.
"""
    raw_response = await generate_ai_text(prompt)
    if not raw_response:
        return []

    try:
        # Clean JSON wrapper if model outputs markdown block ```json ... ```
        clean_json = raw_response.strip()
        if clean_json.startswith("```"):
            lines = clean_json.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            clean_json = "\n".join(lines).strip()
        
        parsed = json.loads(clean_json)
        if isinstance(parsed, list) and len(parsed) > 0:
            return parsed
    except Exception as err:
        logger.warning(f"Could not parse Gemini JSON response for campaign plan: {err}")

    return []
