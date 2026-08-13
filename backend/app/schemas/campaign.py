from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict

class DayPlanSchema(BaseModel):
    day: int
    topic: str
    platform: str
    preview: str

class DayPlanUpdate(BaseModel):
    topic: Optional[str] = None
    platform: Optional[str] = None
    preview: Optional[str] = None

class MatrixRowSchema(BaseModel):
    id: str
    serial: str
    campaignType: str = "Acquire – Cold Audience Awareness"
    creativeType: str = "Single Image Ad"
    pillar: str = "Product & Solution Showcase"
    offer: str = "Free Sample Pack"
    cta: str = "Request Free Sample Pack"
    productionDirection: str = "High-contrast hero product visual"
    primaryText: str = ""
    hookA: str = ""
    hookB: str = ""
    hookC: str = ""
    scriptOutline: str = ""
    assetLink: str = ""
    dueDate: str = ""
    approvalStatus: str = "Pending Review"
    setupStatus: str = "Not Started"
    notes: str = ""
    designOwner: str = "Design Team"

class CampaignMatrixGenerateRequest(BaseModel):
    title: str = Field(..., min_length=2)
    campaignType: Optional[str] = "Acquire – Cold Audience Awareness"
    targetAudience: str = "General Audience"
    tone: str = "Punchy"
    offer: Optional[str] = "Free Sample Pack"
    cta: Optional[str] = "Request Free Sample Pack"
    painPoints: Optional[str] = ""
    durationDays: int = 14
    platforms: List[str] = ["Instagram", "LinkedIn", "Facebook"]
    customPrompt: Optional[str] = ""
    workspaceId: str = "ws-1"

class CampaignMatrixUpdateRequest(BaseModel):
    matrixRows: List[Dict[str, Any]]

class CampaignPreviewRequest(BaseModel):
    title: str = Field(..., min_length=2)
    target_audience: str = "General Audience"
    tone: str = "Punchy"
    workspace_id: str = "ws-1"
    platforms: List[str] = ["Instagram", "LinkedIn"]
    duration_days: Optional[int] = Field(default=7, alias="durationDays")

class CampaignCreate(BaseModel):
    title: str = Field(..., min_length=2)
    target_audience: str = "General Audience"
    tone: str = "Punchy"
    workspace_id: str = "ws-1"
    platforms: List[str] = ["Instagram", "LinkedIn"]
    duration_days: Optional[int] = Field(default=7, alias="durationDays")
    campaignType: Optional[str] = "Acquire – Cold Audience Awareness"
    offer: Optional[str] = "Free Sample Pack"
    cta: Optional[str] = "Request Free Sample Pack"
    painPoints: Optional[str] = ""
    customPrompt: Optional[str] = ""
    plan: Optional[List[DayPlanSchema]] = None
    matrixRows: Optional[List[Dict[str, Any]]] = None
    status: Optional[str] = None

    class Config:
        populate_by_name = True

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
    matrixRows: Optional[List[Dict[str, Any]]] = None

    class Config:
        populate_by_name = True
