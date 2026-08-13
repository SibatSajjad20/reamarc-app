"""
Pydantic schemas for the Performance Marketing Module.
Defines request/response models for marketing campaigns and daily metrics.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime


# ── Marketing Campaign Schemas ──────────────────────────────────────────

class MarketingCampaignCreate(BaseModel):
    """Schema for creating a new marketing campaign."""
    campaign_name: str = Field(..., min_length=2, max_length=200)
    platform: str = Field(default="Meta")  # Meta, Google, TikTok, WhatsApp, Other
    objective: str = Field(default="Lead Generation")
    industry: Optional[str] = Field(default="")
    budget_set: float = Field(default=0.0, ge=0)
    workspace_id: str = Field(default="")


class MarketingCampaignUpdate(BaseModel):
    """Schema for updating static campaign fields."""
    campaign_name: Optional[str] = None
    platform: Optional[str] = None
    objective: Optional[str] = None
    industry: Optional[str] = None
    budget_set: Optional[float] = None
    status: Optional[str] = None  # Active, Paused, Error, Stopped


class MarketingCampaignResponse(BaseModel):
    """Response schema for a marketing campaign document."""
    id: str
    workspace_id: str
    campaign_name: str
    platform: str
    objective: str
    industry: str = ""
    budget_set: float = 0.0
    status: str = "Active"
    created_at: str = ""


# ── Daily Metric Schemas ────────────────────────────────────────────────

class MetricUpsert(BaseModel):
    """
    Upsert schema for daily campaign metrics.
    All metric fields are optional to support partial updates.
    """
    campaign_id: str
    date: str  # ISO date string YYYY-MM-DD
    ad_spend: Optional[float] = None
    cpl_cpa: Optional[float] = None
    leads_conversions: Optional[int] = None
    impressions: Optional[int] = None
    clicks: Optional[int] = None
    reach: Optional[int] = None
    avg_frequency: Optional[float] = None
    remarks: Optional[str] = None
    budget_set: Optional[float] = None
    status: Optional[str] = None


class DailyMatrixRowResponse(BaseModel):
    """
    Flattened response combining campaign info + daily metric record.
    This is what the frontend grid renders as a single row.
    """
    # Campaign static fields
    campaign_id: str
    workspace_id: str
    workspace_name: str = ""
    campaign_name: str
    platform: str
    objective: str
    industry: str = ""
    budget_set: float = 0.0
    status: str = "Active"

    # Daily metric fields (defaults to 0 if no record for the date)
    metric_id: str = ""
    date: str = ""
    ad_spend: float = 0.0
    cpl_cpa: float = 0.0
    leads_conversions: int = 0
    impressions: int = 0
    clicks: int = 0
    reach: int = 0
    avg_frequency: float = 1.0
    remarks: str = ""


# ── Ad Account Credential & Sync Schemas ───────────────────────────────

class AdAccountCredentialCreate(BaseModel):
    """Schema for storing platform API credentials (Meta, Google)."""
    workspace_id: str
    platform: str = Field(..., description="Platform: Meta or Google")
    account_id: str = Field(..., description="e.g. act_123456789 or 123-456-7890")
    access_token: Optional[str] = Field(default="", description="Access token")
    refresh_token: Optional[str] = Field(default="", description="Refresh token for Google Ads")
    developer_token: Optional[str] = Field(default="", description="Developer token for Google Ads")
    client_id: Optional[str] = Field(default="", description="OAuth Client ID for Google Ads")
    client_secret: Optional[str] = Field(default="", description="OAuth Client Secret for Google Ads")
    is_active: bool = Field(default=True)


class AdAccountCredentialResponse(BaseModel):
    """Response schema for AdAccountCredential document."""
    id: str
    workspace_id: str
    platform: str
    account_id: str
    is_active: bool
    created_at: str = ""
    updated_at: str = ""


class SyncNowRequest(BaseModel):
    """Request payload for manual trigger sync."""
    workspace_id: Optional[str] = None
    date: Optional[str] = None  # YYYY-MM-DD, defaults to today
    include_inactive: Optional[bool] = False


class SyncNowResponse(BaseModel):
    """Response summary after automated/manual sync."""
    status: Optional[str] = "processing"
    message: str
    synced_campaigns_count: int = 0
    synced_metrics_count: int = 0
    date: str
    errors: list[str] = []
    rows: Optional[List[DailyMatrixRowResponse]] = None
    hidden_count: Optional[int] = 0


class SyncStatusResponse(BaseModel):
    """Response schema for background sync status query."""
    status: str = "idle"  # idle, processing, completed, error
    message: str = ""
    synced_campaigns_count: int = 0
    synced_metrics_count: int = 0
    date: str = ""
    workspace_id: str = ""
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    errors: list[str] = []

