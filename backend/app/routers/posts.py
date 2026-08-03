from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional, Union
from app.schemas.post import PostResponse, PostSaveDraft, PolishRequest
from app.core.security import get_current_user
from app.database import get_database
from app.services.llm import polish_copy_with_gemini

router = APIRouter(prefix="/posts", tags=["Posts & Inbox"])

INITIAL_POSTS: List[dict] = [
  {
    "id": 101,
    "campaign": "Nova Luxury Living Showcase",
    "platform": "Instagram",
    "date": "Today, 4:00 PM",
    "dayNumber": 3,
    "workspaceId": "ws-1",
    "status": "pending",
    "targetAudience": "HNW Investors & Homebuyers",
    "copy": "Floor-to-ceiling glass, private infinity pools, and zero-compromise craftsmanship. 🏛️\n\nNova Residences offer unparalleled urban tranquility in the heart of downtown. Only 4 penthouse suites remain available for private viewing.\n\nDM 'NOVA' for exclusive floor plans and investor deck access.",
    "lastModified": "10 mins ago",
  },
  {
    "id": 102,
    "campaign": "TechFlow Enterprise Q3 Launch",
    "platform": "LinkedIn",
    "date": "Tomorrow, 9:00 AM",
    "dayNumber": 1,
    "workspaceId": "ws-2",
    "status": "pending",
    "targetAudience": "VPs of Engineering & CTOs",
    "copy": "Legacy CI/CD pipelines are costing engineering teams an average of 14 hours per developer every month in build downtime.\n\nHere is how TechFlow's new distributed caching architecture slashes pipeline runtimes by 65% without requiring custom YAML rewrites:\n\n1. Autonomous artifact deduplication\n2. Parallel test execution threads\n3. Zero-trust security container scanning\n\nRead our technical whitepaper below 👇",
    "lastModified": "1 hour ago",
  },
  {
    "id": 103,
    "campaign": "Nova Luxury Living Showcase",
    "platform": "LinkedIn",
    "date": "Apr 2, 10:30 AM",
    "dayNumber": 4,
    "workspaceId": "ws-1",
    "status": "pending",
    "targetAudience": "HNW Investors",
    "copy": "Real Estate vs Equities: Why prime residential assets continue to act as the ultimate hedge against market volatility.\n\nAnalyzing our Q1 portfolio performance metrics across 12 tier-1 developments.",
    "lastModified": "Yesterday",
  },
]

@router.get("/inbox", response_model=List[PostResponse])
async def list_inbox_tasks(workspace_id: Optional[str] = None):
    db = get_database()
    if db is not None:
        query = {"status": "pending"}
        if workspace_id:
            query["workspaceId"] = workspace_id
        
        cursor = db.posts.find(query, {"_id": 0})
        posts = await cursor.to_list(length=100)
        return posts

    # Fallback to local memory if db is not connected
    if workspace_id:
        return [p for p in INITIAL_POSTS if p["workspaceId"] == workspace_id and p["status"] == "pending"]
    return [p for p in INITIAL_POSTS if p["status"] == "pending"]

@router.post("/{post_id}/approve")
async def approve_post(post_id: Union[int, str], current_user: dict = Depends(get_current_user)):
    db = get_database()
    if db is not None:
        try:
            int_id = int(post_id)
        except ValueError:
            int_id = post_id
            
        result = await db.posts.update_one(
            {"$or": [{"id": post_id}, {"id": int_id}, {"id": str(post_id)}]},
            {"$set": {"status": "approved"}}
        )
        if result.matched_count > 0 or result.modified_count > 0:
            return {"message": "Post approved & scheduled for publishing", "post_id": post_id}
    else:
        for post in INITIAL_POSTS:
            if str(post["id"]) == str(post_id):
                post["status"] = "approved"
                return {"message": "Post approved & scheduled for publishing", "post_id": post_id}
                
    raise HTTPException(status_code=404, detail="Post not found")

@router.patch("/{post_id}/draft")
async def save_draft(post_id: Union[int, str], draft_in: PostSaveDraft, current_user: dict = Depends(get_current_user)):
    db = get_database()
    if db is not None:
        try:
            int_id = int(post_id)
        except ValueError:
            int_id = post_id

        query = {"$or": [{"id": post_id}, {"id": int_id}, {"id": str(post_id)}]}
        result = await db.posts.update_one(
            query,
            {"$set": {"copy": draft_in.copy, "lastModified": "Just now"}}
        )
        if result.matched_count > 0 or result.modified_count > 0:
            updated_post = await db.posts.find_one(query, {"_id": 0})
            return {"message": "Draft updated successfully", "post": updated_post}
    else:
        for post in INITIAL_POSTS:
            if str(post["id"]) == str(post_id):
                post["copy"] = draft_in.copy
                post["lastModified"] = "Just now"
                return {"message": "Draft updated successfully", "post": post}
                
    raise HTTPException(status_code=404, detail="Post not found")

@router.post("/polish")
async def polish_copy(req: PolishRequest, current_user: dict = Depends(get_current_user)):
    polished = await polish_copy_with_gemini(
        copy=req.copy,
        action_type=req.action_type,
        platform=req.platform
    )
    return {"polished_copy": polished}

@router.post("/{post_id}/regenerate-full")
async def regenerate_full_post(post_id: Union[int, str], current_user: dict = Depends(get_current_user)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable.")

    try:
        int_id = int(post_id)
    except ValueError:
        int_id = post_id

    query = {"$or": [{"id": post_id}, {"id": int_id}, {"id": str(post_id)}]}
    post = await db.posts.find_one(query, {"_id": 0})

    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")

    campaign_name = post.get("campaign", "Brand Strategy")
    target_audience = post.get("targetAudience", "B2B Decision Makers")
    platform = post.get("platform", "LinkedIn")

    # Use Gemini to generate brand new full script copy
    fresh_copy = await polish_copy_with_gemini(
        copy=f"Campaign: {campaign_name}\nAudience: {target_audience}\nCurrent Draft Focus: {post.get('copy', '')}",
        action_type="creative_angle",
        platform=platform
    )

    await db.posts.update_one(
        query,
        {"$set": {"copy": fresh_copy, "lastModified": "Just now (AI Regenerated)"}}
    )

    updated_post = await db.posts.find_one(query, {"_id": 0})
    return {"message": "Post script regenerated with Gemini AI", "post": updated_post}
