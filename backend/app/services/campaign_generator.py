import logging
import json
import re
from typing import List, Dict, Any, Optional
from app.services.llm import generate_ai_text, _clean_json_response

logger = logging.getLogger(__name__)

# Standard options matching frontend staticMatrixData and matrix query schemas
CREATIVE_TYPES = [
    "Video", "Reel", "Carousel", "Static", "UGC",
    "Story", "GIF", "Banner", "LP Graphic", "Lead Magnet", "Testimonial"
]

CONTENT_PILLARS = [
    "Industry Demand", "Production Advantage", "Business Growth",
    "Comparison", "Product", "Customer Success", "Educational", "Partnership"
]

DESIGN_OWNERS = ["Video Team", "Design Team", "Copy Team", "Growth Team"]


def get_row_creative_type_and_pillar(row_idx: int) -> tuple[str, str]:
    """Deterministically assign a varied creative type and content pillar for row index (0-indexed)."""
    c_type = CREATIVE_TYPES[row_idx % len(CREATIVE_TYPES)]
    pillar = CONTENT_PILLARS[(row_idx * 3) % len(CONTENT_PILLARS)]
    return c_type, pillar


def build_matrix_prompt(
    title: str,
    campaign_type: str,
    target_audience: str,
    tone: str,
    offer: str,
    cta: str,
    pain_points: str,
    duration_days: int,
    platforms_str: str,
    custom_prompt: str,
    brand_context: str
) -> str:
    """Build high-diversity LLM prompt for generating structured matrix rows."""
    brand_block = ""
    if brand_context.strip():
        brand_block = f"""
RETRIEVED BRAND KNOWLEDGE & TECHNICAL SPECIFICATIONS (RAG):
---
{brand_context[:6000]}
---
"""

    row_assignments = []
    for i in range(duration_days):
        c_type, pillar = get_row_creative_type_and_pillar(i)
        row_assignments.append(f"Row {i+1} (AC-{i+1:03d}): Creative Type = '{c_type}', Content Pillar = '{pillar}'")

    assignments_text = "\n".join(row_assignments)

    prompt = f"""You are an elite B2B Performance Copywriter and Creative Director. Generate a Production & Approval Matrix for a B2B marketing campaign.

CAMPAIGN OVERVIEW:
- Title: "{title}"
- Funnel Strategy / Campaign Type: "{campaign_type}"
- Target Audience Persona: "{target_audience}"
- Tone of Voice: "{tone}"
- Lead Magnet / Offer: "{offer}"
- Primary Call to Action (CTA): "{cta}"
- Customer Pain Points / Objections: "{pain_points or 'General operational bottlenecks, cost friction, and unreliable quality'}"
- Target Channels: {platforms_str}
- Additional Custom Instructions: "{custom_prompt or 'None'}"
{brand_block}

ASSIGNED ROW MATRIX ({duration_days} ROWS TOTAL):
{assignments_text}

CRITICAL RULES FOR GENERATION:

1. STRICT ROW-LEVEL DIVERSITY & UNIQUE COPY:
   - EVERY SINGLE OBJECT in the JSON array MUST have completely distinct, unique Primary Text ('primaryText'), Headlines ('headlinesHooks'), and Creative Script/Copy ('contentOnCreative').
   - Do NOT repeat sentences, hooks, or paragraphs across rows. Row 1, Row 2, Row 3, and all subsequent rows MUST present a completely different narrative angle, hook, and value proposition tailored specifically to their assigned Creative Type and Content Pillar.

2. NO RIGID TEMPLATE INTERPOLATION (CRITICAL):
   - DO NOT concatenate the raw persona string directly into fill-in-the-blank sentences (e.g. NEVER write "Are you a High-Volume Screen Printing Shops looking for..." or "Attention High-Volume Screen Printing Shops!").
   - Adapt the target persona naturally into fluent, highly professional B2B English.
   - Example good phrasing: "Running a high-volume print shop means balancing tight turnaround times with uncompromised quality...", "When managing large-scale custom apparel orders, a single delay can cascade into costly shop downtime...", "For commercial apparel decorators looking to expand output...".

3. ROW-SPECIFIC FORMATTING REQUIREMENTS:
   - Carousel rows ('creativeType' = "Carousel"):
     * 'contentOnCreative' MUST contain clear slide-by-slide copy (e.g. "Slide 1: [Hook headline]\nSlide 2: [Problem breakdown]\nSlide 3: [Production advantage]\nSlide 4: [Proof point]\nSlide 5: [Offer callout & CTA]").
   - Video / Reel rows ('creativeType' = "Video" or "Reel"):
     * 'productionDirection' MUST specify camera style, scene pacing, and visual theme.
     * 'contentOnCreative' MUST include visual scene direction and audio hook scripts (e.g. "Scene 1 (0-3s): [Visual: Macro print shop floor] Audio Hook: 'Most decorators don't lose money on transfers... they lose it on delays.'\nScene 2 (3-7s): [Visual: Heat press operation] Audio: '...'").
   - Static / Banner / LP Graphic rows ('creativeType' = "Static", "Banner", "LP Graphic"):
     * 'contentOnCreative' and 'headlinesHooks' MUST focus on short, high-contrast headline copy, subheadings, and key bullet callouts designed for immediate visual impact on feed graphics.
   - UGC rows ('creativeType' = "UGC"):
     * 'contentOnCreative' MUST be formatted as an authentic, direct-to-camera script or testimonial review.

OUTPUT FORMAT REQUIREMENTS:
Return ONLY a valid JSON array of EXACTLY {duration_days} objects. No markdown code blocks (no ```json wrapper), no conversational preamble.

Each object MUST contain these exact JSON keys:
- "id": string (e.g. "ac-001", "ac-002", ...)
- "serial": string (e.g. "AC-001", "AC-002", ...)
- "campaignType": "{campaign_type}"
- "creativeType": string (matching assigned type for this row)
- "contentPillar": string (matching assigned pillar for this row)
- "contentConcept": string (concise 3-6 word concept headline)
- "offer": "{offer}"
- "cta": "{cta}"
- "productionDirection": string (detailed visual design notes matching the creative type)
- "primaryText": string (2-3 paragraphs of high-converting B2B body copy, 100% unique per row)
- "headlinesHooks": string (Headline library & 3 distinct hooks for this row)
- "contentOnCreative": string (Slide-by-slide / scene script / high-contrast headline according to creative type)
- "hashtagsKeywords": string (3-5 relevant hashtags)
- "designOwner": string ("Video Team", "Design Team", "Copy Team", or "Growth Team")
- "designDue": string ("Wk 1" or "Wk 2")
- "approvalStatus": "Pending Review"
- "setupStatus": "Not Started"
- "notes": string (brief target angle explanation)
"""
    return prompt


def normalize_text_for_comparison(text: str) -> str:
    """Normalize string for strict duplicate checking."""
    if not text:
        return ""
    clean = re.sub(r'[^a-zA-Z0-9\s]', '', text.lower())
    return " ".join(clean.split())


def is_duplicate_text(text1: str, text2: str, threshold: float = 0.80) -> bool:
    """
    Check if two strings are identical or near-identical duplicates.
    Calculates Jaccard word-set similarity and exact prefix/substring match.
    """
    norm1 = normalize_text_for_comparison(text1)
    norm2 = normalize_text_for_comparison(text2)

    if not norm1 or not norm2:
        return False

    if norm1 == norm2:
        return True

    words1 = set(norm1.split())
    words2 = set(norm2.split())

    if not words1 or not words2:
        return False

    intersection = words1.intersection(words2)
    union = words1.union(words2)

    jaccard_sim = len(intersection) / float(len(union))
    if jaccard_sim >= threshold:
        return True

    # Check if first 80 characters match exactly
    if len(norm1) > 30 and len(norm2) > 30:
        if norm1[:80] == norm2[:80]:
            return True

    return False


def validate_matrix_rows(rows: List[Dict[str, Any]]) -> List[int]:
    """
    Verify primaryText strings across rows (specifically row 1, 2, and 3, and all batch rows).
    Returns list of row indices that are duplicates of earlier rows.
    """
    duplicate_indices = []
    seen_texts = []

    for idx, row in enumerate(rows):
        p_text = row.get("primaryText") or row.get("primaryCopy") or ""

        # Normalize field names if needed
        if "primaryCopy" in row and "primaryText" not in row:
            row["primaryText"] = row["primaryCopy"]
        if "pillar" in row and "contentPillar" not in row:
            row["contentPillar"] = row["pillar"]
        if "scriptOutline" in row and "contentOnCreative" not in row:
            row["contentOnCreative"] = row["scriptOutline"]

        is_dup = False
        for prev_text in seen_texts:
            if is_duplicate_text(p_text, prev_text):
                is_dup = True
                break

        if is_dup:
            duplicate_indices.append(idx)
            logger.warning(f"⚠️ Duplicate Primary Text detected at Row {idx+1} (Serial: {row.get('serial', idx+1)})")
        else:
            seen_texts.append(p_text)

    return duplicate_indices


async def regenerate_duplicate_rows(
    rows: List[Dict[str, Any]],
    duplicate_indices: List[int],
    title: str,
    target_audience: str,
    offer: str,
    cta: str,
    brand_context: str
) -> List[Dict[str, Any]]:
    """Re-generate targeted rows that failed uniqueness validation using LLM."""
    existing_unique_texts = [
        r.get("primaryText", "") for i, r in enumerate(rows) if i not in duplicate_indices
    ]
    unique_snippets_str = "\n---\n".join([t[:200] for t in existing_unique_texts if t])

    for idx in duplicate_indices:
        c_type = rows[idx].get("creativeType", "Video")
        pillar = rows[idx].get("contentPillar", "Production Advantage")

        re_prompt = f"""You are a master B2B performance copywriter. Re-write the creative copy for row {idx+1} of a marketing matrix.

TARGET AUDIENCE: "{target_audience}"
CAMPAIGN TITLE: "{title}"
CREATIVE TYPE: "{c_type}"
CONTENT PILLAR: "{pillar}"
OFFER: "{offer}"
CTA: "{cta}"

EXISTING PRIMARY TEXTS ALREADY USED IN OTHER ROWS (DO NOT REPEAT ANY OF THESE):
{unique_snippets_str}

REQUIREMENTS:
1. Write a COMPLETELY NEW, DISTINCT primary copy angle for this row.
2. Adapt target persona naturally in fluent English (do NOT write "Are you a {target_audience}...").
3. Row-specific formatting:
   - Carousel: slide-by-slide copy (Slide 1, Slide 2, Slide 3...)
   - Video/Reel: visual scene direction & audio hooks (Scene 1 0-3s, Scene 2 3-7s...)
   - Static: short high-contrast headline copy.

Return a valid JSON object with exact keys:
"primaryText": string (2-3 paragraphs of unique B2B copy)
"contentConcept": string (short concept title)
"headlinesHooks": string (3 distinct hooks)
"contentOnCreative": string (formatted script/slides/headline)
"productionDirection": string (visual direction)

Return strictly valid JSON with no markdown code blocks.
"""
        raw = await generate_ai_text(re_prompt)
        if raw:
            try:
                clean = _clean_json_response(raw)
                parsed = json.loads(clean)
                if isinstance(parsed, dict) and parsed.get("primaryText"):
                    rows[idx]["primaryText"] = parsed["primaryText"].strip()
                    if parsed.get("headlinesHooks"):
                        rows[idx]["headlinesHooks"] = parsed["headlinesHooks"].strip()
                    if parsed.get("contentOnCreative"):
                        rows[idx]["contentOnCreative"] = parsed["contentOnCreative"].strip()
                    if parsed.get("productionDirection"):
                        rows[idx]["productionDirection"] = parsed["productionDirection"].strip()
                    if parsed.get("contentConcept"):
                        rows[idx]["contentConcept"] = parsed["contentConcept"].strip()

                    unique_snippets_str += f"\n---\n{rows[idx]['primaryText'][:200]}"
                    logger.info(f"✨ Successfully re-generated unique copy for duplicate Row {idx+1}")
                    continue
            except Exception as err:
                logger.warning(f"Could not parse re-generation JSON for row {idx+1}: {err}")

        # Fallback transformation if LLM fails for this row
        rows[idx] = generate_single_heuristic_row(
            row_idx=idx,
            title=title,
            campaign_type=rows[idx].get("campaignType", "Acquire – Cold Audience Awareness"),
            target_audience=target_audience,
            offer=offer,
            cta=cta,
            c_type=c_type,
            pillar=pillar
        )

    return rows


def generate_single_heuristic_row(
    row_idx: int,
    title: str,
    campaign_type: str,
    target_audience: str,
    offer: str,
    cta: str,
    c_type: str,
    pillar: str
) -> Dict[str, Any]:
    """Generate a single procedural matrix row with unique copy and formatting."""
    num_str = f"{row_idx + 1:03d}"

    # Audience adaptation helper
    aud_clean = target_audience.strip()
    if aud_clean.lower().startswith("a "):
        aud_phrase = aud_clean[2:]
    elif aud_clean.lower().startswith("an "):
        aud_phrase = aud_clean[3:]
    else:
        aud_phrase = aud_clean

    # 14 distinct narrative angles tailored to creative types and pillars
    angles = [
        {
            "concept": "The Hidden Downtime Trap",
            "hook1": f"How much is production friction secretly costing your team this quarter?",
            "hook2": f"Why leading shop managers are rethinking their supplier workflow.",
            "primary": f"In high-volume decoration environments, quiet bottlenecks build up long before deadlines are missed. When print shops encounter unexpected material variance or delayed restocks, press margins shrink fast.\n\nEvaluating your supply chain before peak season isn't just about price—it's about operational reliability. Upgrading your workflow with tested, commercial-grade materials ensures every job leaves your shop on schedule.\n\nTake advantage of our {offer} to experience how seamless production feels when backed by dedicated technical support.",
        },
        {
            "concept": "Consistency & Quality Benchmark",
            "hook1": f"Your customers don't see your suppliers—they only see your final press.",
            "hook2": f"The simple quality check that separates top-tier decorators from the rest.",
            "primary": f"Commercial apparel decoration requires absolute repeatability across every single garment. A single defective print or color fade can ruin an entire client relationship.\n\nBy building your output around precision-engineered transfers and standardized press parameters, your business establishes an unshakeable reputation for flawless quality.\n\nRequest your {offer} today and compare our print clarity, wash durability, and press speed firsthand.",
        },
        {
            "concept": "Scaling Output Without Extra Headcount",
            "hook1": f"Scale your decorated apparel volume without expanding your press floor.",
            "hook2": f"How modern decorators double daily output with streamlined application.",
            "primary": f"Growing a decorating business often feels like a constant race against machine capacity and labor costs. To scale profitably, forward-thinking shop operators focus on application velocity.\n\nOur advanced transfers are engineered for instant heat release and rapid dwell times, helping your team complete large order batches in half the time.\n\nClaim your {offer} to test our fast-application formulas on your shop's heat presses.",
        },
        {
            "concept": "Cost Comparison & True Margin Analysis",
            "hook1": f"The cheapest supply invoice is often the most expensive one on your press floor.",
            "hook2": f"Calculate the true cost of reprints, delays, and wasted blank garments.",
            "primary": f"Comparing suppliers purely on unit cost ignores the hidden expenses of reprints, adhesive bleed, and lost press operator time. When an unreliable transfer fails, you lose the blank garment, the labor, and customer trust.\n\nSmart decorators choose production partners who guarantee lot-to-lot consistency and zero-defect output.\n\nRequest your {offer} and discover why professional shops switch for long-term margin protection.",
        },
        {
            "concept": "High-Density Detail & Stretch Performance",
            "hook1": f"Tired of cracking graphics and stiff chest prints on performance wear?",
            "hook2": f"The transfer technology built specifically for modern activewear and blends.",
            "primary": f"Decorating athletic poly-blends and stretch fabrics presents unique challenges that standard inks can't handle. Cracking, dye migration, and heavy hand feel frustrate customers.\n\nOur ultra-flexible, soft-touch transfer formulations bond seamlessly to activewear while resisting bleed-through.\n\nTest our stretch durability for yourself with a complimentary {offer}.",
        },
        {
            "concept": "Rapid Turnaround Guarantee",
            "hook1": f"Never turn down a lucrative rush order due to supplier lead times again.",
            "hook2": f"How top decorating teams fulfill last-minute corporate apparel orders effortlessly.",
            "primary": f"When high-value corporate clients demand 48-hour turnarounds, having a fast, reliable production partner makes all the difference between closing the contract or losing to a competitor.\n\nWith guaranteed fast dispatch and proven press reliability, you can take on tight-deadline contracts with complete confidence.\n\nGet started today with your free {offer}.",
        },
        {
            "concept": "Zero Dye Migration Guarantee",
            "hook1": f"Stop letting polyester bleed ruin your bright white chest graphics.",
            "hook2": f"The anti-bleed barrier tech that saves thousands in ruined blanks.",
            "primary": f"Sublimated polyester garments are notorious for bleeding through light-colored graphics after pressing. Traditional blocker layers add stiffness and weight that customers dislike.\n\nOur next-generation blocker technology stops dye migration completely without compromising flexibility or hand feel.\n\nRequest a {offer} to test our zero-bleed technology on your tough dark poly garments.",
        },
        {
            "concept": "Eco-Friendly Water-Based Comfort",
            "hook1": f"Deliver retail-ready softness that eco-conscious fashion brands demand.",
            "hook2": f"Switch from heavy plastisol feel to feather-light water-based transfers.",
            "primary": f"Modern apparel buyers prioritize sustainable production and soft hand-feel. Heavy, rubbery chest prints no longer pass inspection for premium brand merch.\n\nOur water-based transfer formulas combine vibrant opacity with a weightless feel that feels directly screen printed onto the garment.\n\nUpgrade your decoration offerings today with a free {offer}.",
        },
        {
            "concept": "Multi-Placement Versatility",
            "hook1": f"One transfer solution for caps, sleeves, chest pockets, and heavy hoodies.",
            "hook2": f"Simplify inventory by standardizing your multi-position print workflow.",
            "primary": f"Managing different print methods for hats, sleeves, and fleece garments creates inventory headaches and setup delays. Standardizing on versatile transfer formulas eliminates setup confusion.\n\nOur multi-substrate adhesives press cleanly onto cotton, nylon, fleece, and structured headwear with identical press parameters.\n\nTry our multi-placement sample kit with a complimentary {offer}.",
        },
        {
            "concept": "Peak Season Capacity Planning",
            "hook1": f"Prepare your shop floor for Q4 rush volumes before the surge begins.",
            "hook2": f"How top-performing decorators handle 10x holiday order spikes stress-free.",
            "primary": f"Peak shipping seasons bring unprecedented order volume and zero room for error. When press operators waste minutes wrestling with difficult peels, backlogs compound exponentially.\n\nEngineered for instant hot peel and effortless application, our transfers keep your heat press line running at maximum speed.\n\nSecure your peak season supply line with a free {offer} today.",
        },
        {
            "concept": "Client Retention & Re-Order Mastery",
            "hook1": f"Turn one-time corporate orders into multi-year recurring accounts.",
            "hook2": f"The print durability standard that builds client loyalty automatically.",
            "primary": f"Winning a corporate account is hard, but retaining them requires consistent wash durability. When prints peel or crack after a few washes, clients quiet switch to another vendor.\n\nOur industrial-grade transfers are lab-tested for 50+ commercial wash cycles, ensuring your prints look fresh long after delivery.\n\nBuild long-term customer retention by claiming your {offer} today.",
        },
        {
            "concept": "Small Batch Profitability",
            "hook1": f"Make 12-piece short runs just as profitable as 500-piece production orders.",
            "hook2": f"Eliminate screen setup costs and chemical cleaning on short-run orders.",
            "primary": f"Screen printing short runs often results in lost profit due to screen exposure, registration, and cleanup overhead. Direct-to-film transfers turn small batches into high-margin orders.\n\nWith zero setup fees and instant press readiness, you can quote short-run jobs competitively while protecting your margin.\n\nTest small-run profitability today with a complimentary {offer}.",
        },
        {
            "concept": "Color Vibrancy & Pantone Matching",
            "hook1": f"Achieve exact corporate Pantone color matching without custom ink mixing.",
            "hook2": f"Say goodbye to dull, muddy prints on dark garment backgrounds.",
            "primary": f"Corporate branding guidelines demand exact color fidelity across apparel runs. Mixing inks manually is time-consuming and prone to batch-to-batch color shift.\n\nOur high-opacity digital transfer process delivers vibrant, Pantone-matched output on both light and dark garments from press 1 to press 1,000.\n\nExperience true color fidelity with a free {offer} delivered to your shop.",
        },
        {
            "concept": "Operator Safety & Clean Shop Environment",
            "hook1": f"Create a cleaner, odor-free press environment for your decorating crew.",
            "hook2": f"Eliminate harsh solvent fumes and messy cleanup from your shop floor.",
            "primary": f"Maintaining a clean, safe work environment is essential for operator retention and shop safety. Solvent-heavy inks and chemicals create workplace hazards and messy press stations.\n\nOur eco-certified transfers require no chemical solvents, screens, or washup stations—just clean, heat-activated application.\n\nTransform your shop environment today with a sample {offer}.",
        }
    ]

    selected_angle = angles[row_idx % len(angles)]
    primary_text_unique = selected_angle["primary"]

    # Format contentOnCreative based on creativeType
    if c_type == "Carousel":
        content_on_creative = (
            f"Slide 1\n{selected_angle['concept']}\n{selected_angle['hook1']}\n\n"
            f"Slide 2\nThe Problem:\nHow hidden press downtime silently drains shop profitability.\n\n"
            f"Slide 3\nThe Solution:\nEngineered transfers with zero dye migration and fast dwell times.\n\n"
            f"Slide 4\nProven Results:\nTested across 50+ wash cycles with flawless stretch retention.\n\n"
            f"Slide 5\nNext Steps:\n{cta}\nClaim your free {offer} today."
        )
        prod_direction = f"5-slide minimal carousel deck. High-contrast typography, macro transfer close-ups, clean brand color palette. Slide 1 hero hook, Slides 2-4 visual breakdown, Slide 5 CTA card."
    elif c_type in ["Video", "Reel"]:
        content_on_creative = (
            f"Scene 1 (0–3s)\nVisual: Busy print shop floor, heat press running.\nAudio Hook: \"{selected_angle['hook1']}\"\n\n"
            f"Scene 2 (3–10s)\nVisual: Close-up macro shot of crisp transfer peel on garment.\nAudio: \"In high-volume decorating, quiet bottlenecks cost more than invoice prices. Here is how top shops solve it...\"\n\n"
            f"Scene 3 (10–20s)\nVisual: Operator pressing garment effortlessly, showing soft hand feel.\nAudio: \"Engineered for fast dwell time and 50+ wash durability, giving your team complete confidence.\"\n\n"
            f"Scene 4 (20–30s)\nVisual: Unboxing the {offer} with clear CTA graphic.\nAudio: \"Test the quality yourself. {cta}.\""
        )
        prod_direction = f"Dynamic 9:16 vertical video visual direction. Macro lens close-ups of print texture, energetic cut pacing, kinetic text overlays for key soundbites, natural shop lighting."
    elif c_type == "UGC":
        content_on_creative = (
            f"Creator Talking Head Script (0–30s)\n"
            f"\"Okay, if you run a shop printing custom apparel, you NEED to see this. "
            f"We were struggling with press turnaround on poly-blends until we tested these transfers. "
            f"{selected_angle['hook2']} The peel is insanely smooth, zero cracking, and the colors pop. "
            f"Grab your free {offer} right now and try it on your press!\""
        )
        prod_direction = f"Authentic UGC talking-head format. Natural creator environment, hand-held camera movement, direct line-of-sight eye contact, quick press demo B-roll."
    else: # Static, Banner, LP Graphic, Story, GIF, etc.
        content_on_creative = (
            f"Headline:\n{selected_angle['concept']}\n\n"
            f"Subheadline:\n{selected_angle['hook1']}\n\n"
            f"Key Feature Bullets:\n"
            f"• Premium Hand Feel & Zero Dye Bleed\n"
            f"• Rapid Dwell Time for High-Volume Pressing\n"
            f"• Tested Across 50+ Commercial Wash Cycles\n\n"
            f"CTA Button:\n{cta}"
        )
        prod_direction = f"High-impact B2B static ad graphic. Crisp product macro focal point, bold two-line headline lockup, generous negative space, footer offer badge."

    owner = DESIGN_OWNERS[row_idx % len(DESIGN_OWNERS)]
    week_due = "Wk 1" if row_idx < 7 else "Wk 2"

    return {
        "id": f"ac-{num_str}",
        "serial": f"AC-{num_str}",
        "campaignType": campaign_type,
        "creativeType": c_type,
        "contentPillar": pillar,
        "contentConcept": selected_angle["concept"],
        "offer": offer,
        "cta": cta,
        "productionDirection": prod_direction,
        "primaryText": primary_text_unique,
        "headlinesHooks": f"--- Hooks ---\nHook 1: {selected_angle['hook1']}\nHook 2: {selected_angle['hook2']}\nHook 3: Transform your decorating output with proven application speed.\n\n--- Headline ---\n{selected_angle['concept']}",
        "contentOnCreative": content_on_creative,
        "hashtagsKeywords": f"#{c_type.lower()} #b2bmarketing #apparelprinting #printshop #{pillar.lower().replace(' ', '')}",
        "assetLink": "",
        "dueDate": week_due,
        "approvalStatus": "Pending Review",
        "setupStatus": "Not Started",
        "notes": f"Tailored angle for {aud_phrase} focusing on {pillar}.",
        "designOwner": owner
    }


def generate_heuristic_fallback_matrix(
    title: str,
    campaign_type: str,
    target_audience: str,
    offer: str,
    cta: str,
    duration_days: int
) -> List[Dict[str, Any]]:
    """Generate N distinct matrix rows using procedural heuristic generator."""
    logger.info(f"Generating {duration_days} dynamic heuristic matrix rows for '{title}'")
    rows = []
    for i in range(duration_days):
        c_type, pillar = get_row_creative_type_and_pillar(i)
        row = generate_single_heuristic_row(
            row_idx=i,
            title=title,
            campaign_type=campaign_type,
            target_audience=target_audience,
            offer=offer,
            cta=cta,
            c_type=c_type,
            pillar=pillar
        )
        rows.append(row)
    return rows


async def generate_campaign_matrix(
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
) -> List[Dict[str, Any]]:
    """
    Primary Entrypoint: Generate N structured Production Matrix rows using Gemini AI with RAG brand context.
    Includes strict prompt engineering for row-level diversity, natural persona adaptation,
    row-specific formatting (Carousel slides, Video scripts, Static headlines), and Python duplicate validation.
    """
    platforms_list = platforms if platforms else ["Instagram", "LinkedIn", "Facebook"]
    platforms_str = ", ".join(platforms_list)

    prompt = build_matrix_prompt(
        title=title,
        campaign_type=campaign_type,
        target_audience=target_audience,
        tone=tone,
        offer=offer,
        cta=cta,
        pain_points=pain_points,
        duration_days=duration_days,
        platforms_str=platforms_str,
        custom_prompt=custom_prompt,
        brand_context=brand_context
    )

    raw_response = await generate_ai_text(prompt)
    rows = []

    if raw_response:
        try:
            clean_json = _clean_json_response(raw_response)
            parsed = json.loads(clean_json)
            if isinstance(parsed, list) and len(parsed) > 0:
                rows = parsed[:duration_days]
                logger.info(f"✨ AI generated {len(rows)} raw matrix rows for campaign '{title}'")
        except Exception as err:
            logger.warning(f"Could not parse matrix JSON response from LLM: {err}")

    # Fallback to heuristic matrix if LLM call failed or returned empty list
    if not rows:
        rows = generate_heuristic_fallback_matrix(
            title=title,
            campaign_type=campaign_type,
            target_audience=target_audience,
            offer=offer,
            cta=cta,
            duration_days=duration_days
        )
    elif len(rows) < duration_days:
        # Pad with heuristic rows if LLM generated fewer rows than requested
        needed = duration_days - len(rows)
        for i in range(needed):
            idx = len(rows)
            c_type, pillar = get_row_creative_type_and_pillar(idx)
            rows.append(generate_single_heuristic_row(
                row_idx=idx,
                title=title,
                campaign_type=campaign_type,
                target_audience=target_audience,
                offer=offer,
                cta=cta,
                c_type=c_type,
                pillar=pillar
            ))

    # Perform Backend Python Validation to verify primaryText uniqueness across rows
    duplicate_indices = validate_matrix_rows(rows)

    if duplicate_indices:
        logger.warning(f"⚠️ Found duplicate Primary Text in rows {duplicate_indices}. Triggering row-level re-generation...")
        rows = await regenerate_duplicate_rows(
            rows=rows,
            duplicate_indices=duplicate_indices,
            title=title,
            target_audience=target_audience,
            offer=offer,
            cta=cta,
            brand_context=brand_context
        )
        # Re-validate after re-generation
        remaining_dups = validate_matrix_rows(rows)
        if remaining_dups:
            logger.warning(f"⚠️ Remaining duplicates after LLM re-generation in rows {remaining_dups}. Applying heuristic unique replacement.")
            for d_idx in remaining_dups:
                c_type, pillar = get_row_creative_type_and_pillar(d_idx)
                rows[d_idx] = generate_single_heuristic_row(
                    row_idx=d_idx,
                    title=title,
                    campaign_type=campaign_type,
                    target_audience=target_audience,
                    offer=offer,
                    cta=cta,
                    c_type=c_type,
                    pillar=pillar
                )

    # Ensure key normalization across all returned rows
    for idx, r in enumerate(rows):
        if "primaryText" not in r:
            r["primaryText"] = r.get("primaryCopy", "")
        if "contentPillar" not in r:
            r["contentPillar"] = r.get("pillar", CONTENT_PILLARS[0])
        if "contentOnCreative" not in r:
            r["contentOnCreative"] = r.get("scriptOutline", "")
        if "serial" not in r:
            r["serial"] = f"AC-{idx+1:03d}"
        if "id" not in r:
            r["id"] = f"ac-{idx+1:03d}"

    logger.info(f"✅ Successfully validated {len(rows)} diverse campaign matrix rows for '{title}'")
    return rows
