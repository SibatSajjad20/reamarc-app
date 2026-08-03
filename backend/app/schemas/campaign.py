from pydantic import BaseModel, Field
from typing import List, Optional

class DayPlanSchema(BaseModel):
    day: int
    topic: str
    platform: str
    preview: str

class DayPlanUpdate(BaseModel):
    topic: Optional[str] = None
    platform: Optional[str] = None
    preview: Optional[str] = None


class CampaignCreate(BaseModel):
    title: str = Field(..., min_length=2)
    target_audience: str = "General Audience"
    tone: str = "Punchy"
    workspace_id: str = "ws-1"
    platforms: List[str] = ["Instagram", "LinkedIn"]

class CampaignResponse(BaseModel):
    id: str
    title: str
    status: str
    currentDay: int = Field(..., alias="currentDay")
    totalDays: int = Field(..., alias="totalDays")
    workspaceId: str = Field(..., alias="workspaceId")
    platforms: List[str]
    targetAudience: str = Field(..., alias="targetAudience")
    tone: str
    createdAt: str = Field(..., alias="createdAt")
    plan: Optional[List[DayPlanSchema]] = None

    class Config:
        populate_by_name = True
