from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from app.schemas.campaign import CampaignCreate, CampaignResponse, DayPlanSchema, DayPlanUpdate
from app.core.security import get_current_user
from app.database import get_database
from app.services.llm import generate_campaign_plan_with_gemini, polish_copy_with_gemini
import uuid

router = APIRouter(prefix="/campaigns", tags=["Campaigns"])

INITIAL_CAMPAIGNS: List[dict] = [
  {
    "id": "camp-1",
    "title": "Nova Luxury Living Showcase",
    "status": "Active",
    "currentDay": 3,
    "totalDays": 7,
    "workspaceId": "ws-1",
    "platforms": ["Instagram", "LinkedIn"],
    "targetAudience": "HNW Investors & Homebuyers",
    "tone": "Bold & Visionary",
    "createdAt": "2026-03-24",
    "plan": [
      { "day": 1, "topic": "Architectural Spotlight", "platform": "Instagram", "preview": "Step into the sanctuary of modern design..." },
      { "day": 2, "topic": "Market Returns Analysis", "platform": "LinkedIn", "preview": "Why luxury residential yields are outperforming tech..." },
      { "day": 3, "topic": "Private Penthouse Tour", "platform": "Instagram", "preview": "Floor-to-ceiling panoramic views over downtown..." },
    ]
  },
  {
    "id": "camp-2",
    "title": "TechFlow Enterprise Q3 Launch",
    "status": "Pending Plan Approval",
    "currentDay": 0,
    "totalDays": 7,
    "workspaceId": "ws-2",
    "platforms": ["LinkedIn", "Twitter"],
    "targetAudience": "VPs of Engineering & CTOs",
    "tone": "Punchy",
    "createdAt": "2026-03-28",
    "plan": []
  }
]

def normalize_campaign(doc: dict) -> dict:
    """Normalize campaign document from MongoDB (snake_case or camelCase) to camelCase frontend schema."""
    return {
        "id": str(doc.get("id", f"camp-{uuid.uuid4().hex[:8]}")),
        "title": str(doc.get("title", "Untitled Campaign")),
        "status": str(doc.get("status", "Active")),
        "currentDay": int(doc.get("currentDay") or doc.get("current_day") or 1),
        "totalDays": int(doc.get("totalDays") or doc.get("total_days") or 7),
        "workspaceId": str(doc.get("workspaceId") or doc.get("workspace_id") or "ws-1"),
        "platforms": doc.get("platforms") or ["LinkedIn"],
        "targetAudience": str(doc.get("targetAudience") or doc.get("target_audience") or "General Audience"),
        "tone": str(doc.get("tone", "Punchy")),
        "createdAt": str(doc.get("createdAt") or doc.get("created_at") or "Today"),
        "plan": doc.get("plan") or [],
    }

@router.get("", response_model=List[CampaignResponse])
async def list_campaigns(
    workspace_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    if db is not None:
        query = {"user_id": current_user["id"]}
        if workspace_id:
            query["$or"] = [{"workspaceId": workspace_id}, {"workspace_id": workspace_id}]
        cursor = db.campaigns.find(query, {"_id": 0})
        campaigns = await cursor.to_list(length=100)
        return [normalize_campaign(c) for c in campaigns]

    # Fallback if DB is unavailable
    if workspace_id:
        return [normalize_campaign(c) for c in INITIAL_CAMPAIGNS if c.get("workspaceId") == workspace_id or c.get("workspace_id") == workspace_id]
    return [normalize_campaign(c) for c in INITIAL_CAMPAIGNS]

@router.post("", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    campaign_in: CampaignCreate,
    current_user: dict = Depends(get_current_user)
):
    campaign_id = f"camp-{uuid.uuid4().hex[:8]}"
    db = get_database()
    
    # Try generating 7-Day Plan preview using Gemini AI
    ai_plan = await generate_campaign_plan_with_gemini(
        title=campaign_in.title,
        target_audience=campaign_in.target_audience,
        tone=campaign_in.tone,
        platforms=campaign_in.platforms
    )
    
    if not ai_plan:
        ai_plan = [
            {
                "day": 1,
                "topic": f"{campaign_in.title}: Teaser & Problem Hook",
                "platform": campaign_in.platforms[0] if campaign_in.platforms else "LinkedIn",
                "preview": f"Are you struggling with {campaign_in.target_audience}? Here is how to fix it in 2026...",
            },
            {
                "day": 2,
                "topic": "Core Solution & Value Proposition",
                "platform": campaign_in.platforms[1] if len(campaign_in.platforms) > 1 else "Instagram",
                "preview": "3 key pillars every brand needs to adopt today. Swipe left for the breakdown. ✨",
            },
            {
                "day": 3,
                "topic": "Case Study & Social Proof Highlight",
                "platform": campaign_in.platforms[0] if campaign_in.platforms else "LinkedIn",
                "preview": "How we helped our partner scale conversions by 140% in under 30 days...",
            },
            {
                "day": 4,
                "topic": "Interactive Community Poll",
                "platform": "Twitter",
                "preview": "What is your biggest bottleneck right now? Let us know below 👇",
            },
            {
                "day": 5,
                "topic": "Feature Breakdown & Deep Dive",
                "platform": campaign_in.platforms[0] if campaign_in.platforms else "Instagram",
                "preview": "Built specifically for modern teams. Here is how our automated engine works...",
            },
            {
                "day": 6,
                "topic": "Behind-the-Scenes & Expert Tips",
                "platform": "Facebook",
                "preview": "Top 3 insider secrets that most strategy teams overlook during launch week...",
            },
            {
                "day": 7,
                "topic": "Urgency Call-To-Action & Direct Offer",
                "platform": campaign_in.platforms[0] if campaign_in.platforms else "LinkedIn",
                "preview": "Ready to transform your copy workflow? Book your strategy call today!",
            },
        ]

    new_campaign = {
        "id": campaign_id,
        "title": campaign_in.title,
        "status": "Active",
        "currentDay": 1,
        "totalDays": 7,
        "workspaceId": campaign_in.workspace_id,
        "platforms": campaign_in.platforms,
        "targetAudience": campaign_in.target_audience,
        "tone": campaign_in.tone,
        "createdAt": "Today",
        "plan": ai_plan,
        "user_id": current_user["id"],
    }
    
    # Save to MongoDB
    if db is not None:
        await db.campaigns.insert_one(new_campaign.copy())
        
        # Also create Day 1 pending inbox task post in db.posts
        if ai_plan:
            day1 = ai_plan[0]
            new_post = {
                "id": int(uuid.uuid4().int % 1000000),
                "campaign": campaign_in.title,
                "platform": day1.get("platform", "LinkedIn"),
                "date": "Today, 4:00 PM",
                "dayNumber": 1,
                "workspaceId": campaign_in.workspace_id,
                "status": "pending",
                "targetAudience": campaign_in.target_audience,
                "copy": f"{day1.get('preview')}\n\nGenerated by Reamarc AI for {campaign_in.target_audience}.",
                "lastModified": "Just now",
                "user_id": current_user["id"],
            }
            await db.posts.insert_one(new_post)

    else:
        INITIAL_CAMPAIGNS.insert(0, new_campaign)
        
    return normalize_campaign(new_campaign)

@router.delete("/{campaign_id}")
async def delete_campaign(
    campaign_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable.")

    # Find campaign to verify title for post deletion
    camp = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user["id"]})
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    camp_title = camp.get("title")

    # Delete campaign document
    await db.campaigns.delete_one({"id": campaign_id, "user_id": current_user["id"]})

    # Purge associated posts from db.posts
    if camp_title:
        await db.posts.delete_many({"campaign": camp_title, "user_id": current_user["id"]})

    return {"message": f"Campaign '{camp_title}' and associated posts deleted successfully."}

@router.patch("/{campaign_id}/plan/{day_number}", response_model=CampaignResponse)
async def update_day_plan_item(
    campaign_id: str,
    day_number: int,
    item_in: DayPlanUpdate,
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable.")

    camp = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user["id"]})
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    plan = camp.get("plan", [])
    updated = False
    for day_item in plan:
        if day_item.get("day") == day_number:
            if item_in.topic is not None:
                day_item["topic"] = item_in.topic
            if item_in.platform is not None:
                day_item["platform"] = item_in.platform
            if item_in.preview is not None:
                day_item["preview"] = item_in.preview
            updated = True
            break

    if not updated:
        raise HTTPException(status_code=404, detail=f"Day {day_number} plan item not found.")

    await db.campaigns.update_one(
        {"id": campaign_id, "user_id": current_user["id"]},
        {"$set": {"plan": plan}}
    )

    updated_camp = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    return normalize_campaign(updated_camp)

@router.post("/{campaign_id}/plan/{day_number}/regenerate", response_model=CampaignResponse)
async def regenerate_day_plan_item(
    campaign_id: str,
    day_number: int,
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable.")

    camp = await db.campaigns.find_one({"id": campaign_id, "user_id": current_user["id"]})
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    plan = camp.get("plan", [])
    target_item = None
    for day_item in plan:
        if day_item.get("day") == day_number:
            target_item = day_item
            break

    if not target_item:
        raise HTTPException(status_code=404, detail=f"Day {day_number} plan item not found.")

    # Generate fresh AI topic & preview using Gemini
    title = camp.get("title", "Campaign")
    audience = camp.get("targetAudience", "General Audience")
    platform = target_item.get("platform", "LinkedIn")

    new_copy = await polish_copy_with_gemini(
        copy=f"Topic: {target_item.get('topic')}\nPreview: {target_item.get('preview')}",
        action_type="creative_angle",
        platform=platform
    )

    lines = [line.strip() for line in new_copy.split('\n') if line.strip()]
    if lines:
        target_item["topic"] = lines[0][:80]
        target_item["preview"] = " ".join(lines[1:]) if len(lines) > 1 else lines[0]
    else:
        target_item["topic"] = f"Day {day_number}: Re-imagined Strategy Angle"
        target_item["preview"] = f"Fresh content focus targeting {audience} on {platform}."

    await db.campaigns.update_one(
        {"id": campaign_id, "user_id": current_user["id"]},
        {"$set": {"plan": plan}}
    )

    updated_camp = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    return normalize_campaign(updated_camp)
