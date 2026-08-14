from pydantic import BaseModel, Field
from typing import Optional
from app.models.user import UserRole

class AdAccountCreate(BaseModel):
    name: str = Field(..., min_length=2, description="Ad account or Client brand name")
    platform: Optional[str] = "Meta Ads"
    industry: Optional[str] = "General B2B"
    brand_color: Optional[str] = "bg-indigo-600"
    initials: Optional[str] = None
    account_id: Optional[str] = None
    pixel_id: Optional[str] = None
    is_active: bool = True

class AdAccountUpdate(BaseModel):
    name: Optional[str] = None
    platform: Optional[str] = None
    industry: Optional[str] = None
    brand_color: Optional[str] = None
    initials: Optional[str] = None
    account_id: Optional[str] = None
    pixel_id: Optional[str] = None
    is_active: Optional[bool] = None

class AdAccountResponse(BaseModel):
    id: str
    name: str
    platform: Optional[str] = "Meta Ads"
    industry: Optional[str] = "General B2B"
    brandColor: Optional[str] = "bg-indigo-600"
    brand_color: Optional[str] = "bg-indigo-600"
    initials: Optional[str] = None
    account_id: Optional[str] = None
    pixel_id: Optional[str] = None
    isDefault: Optional[bool] = False
    created_at: Optional[str] = None

# Backward compatibility aliases
AdminCreateWorkspace = AdAccountCreate
AdminUpdateWorkspace = AdAccountUpdate
