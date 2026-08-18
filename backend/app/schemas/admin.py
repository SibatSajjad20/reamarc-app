from pydantic import BaseModel, Field
from typing import Optional, List

# ─── WORKSPACE SCHEMAS ──────────────────────────────────────────

class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=2, description="Client workspace name")
    brand_color: Optional[str] = "bg-indigo-600"
    status: Optional[str] = "active"
    initials: Optional[str] = None
    proposal_url: Optional[str] = None
    proposal_name: Optional[str] = None
    proposal_size: Optional[int] = None
    project_cycle: Optional[str] = "Retainer"
    priority: Optional[str] = "Medium"
    contract_start_date: Optional[str] = None
    contract_end_date: Optional[str] = None
    services: Optional[List[str]] = Field(default_factory=list)
    health: Optional[str] = "Good"
    poc_name: Optional[str] = None
    poc_email: Optional[str] = None
    poc_phone: Optional[str] = None
    billing_name: Optional[str] = None
    billing_email: Optional[str] = None
    billing_phone: Optional[str] = None
    is_default: bool = False

class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    brand_color: Optional[str] = None
    status: Optional[str] = None
    initials: Optional[str] = None
    proposal_url: Optional[str] = None
    proposal_name: Optional[str] = None
    proposal_size: Optional[int] = None
    project_cycle: Optional[str] = None
    priority: Optional[str] = None
    contract_start_date: Optional[str] = None
    contract_end_date: Optional[str] = None
    services: Optional[List[str]] = None
    health: Optional[str] = None
    poc_name: Optional[str] = None
    poc_email: Optional[str] = None
    poc_phone: Optional[str] = None
    billing_name: Optional[str] = None
    billing_email: Optional[str] = None
    billing_phone: Optional[str] = None
    is_default: Optional[bool] = None

class WorkspaceResponse(BaseModel):
    id: str
    name: str
    brandColor: Optional[str] = "bg-indigo-600"
    brand_color: Optional[str] = "bg-indigo-600"
    status: Optional[str] = "active"
    initials: Optional[str] = None
    proposal_url: Optional[str] = None
    proposal_name: Optional[str] = None
    proposal_size: Optional[int] = None
    project_cycle: Optional[str] = "Retainer"
    priority: Optional[str] = "Medium"
    contract_start_date: Optional[str] = None
    contract_end_date: Optional[str] = None
    services: Optional[List[str]] = Field(default_factory=list)
    health: Optional[str] = "Good"
    poc_name: Optional[str] = None
    poc_email: Optional[str] = None
    poc_phone: Optional[str] = None
    billing_name: Optional[str] = None
    billing_email: Optional[str] = None
    billing_phone: Optional[str] = None
    isDefault: Optional[bool] = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


# ─── AD ACCOUNT SCHEMAS ─────────────────────────────────────────

class AdAccountCreate(BaseModel):
    name: str = Field(..., min_length=2, description="Ad account name")
    platform: str = Field("Meta Ads", description="Advertising Platform (Meta Ads or Google Ads)")
    account_id: str = Field(..., description="Ad account ID (e.g. act_123456789 or 123-456-7890)")
    pixel_id: Optional[str] = None
    workspace_id: Optional[str] = Field(None, description="ID of the associated Workspace")
    currency: Optional[str] = "USD"
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    developer_token: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None

class AdAccountUpdate(BaseModel):
    name: Optional[str] = None
    platform: Optional[str] = None
    account_id: Optional[str] = None
    pixel_id: Optional[str] = None
    workspace_id: Optional[str] = None
    currency: Optional[str] = None
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    developer_token: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None

class AdAccountResponse(BaseModel):
    id: str
    name: str
    platform: str
    account_id: str
    pixel_id: Optional[str] = None
    workspace_id: Optional[str] = None
    workspace_name: Optional[str] = None
    currency: Optional[str] = "USD"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


# Backward compatibility aliases
AdminCreateWorkspace = WorkspaceCreate
AdminUpdateWorkspace = WorkspaceUpdate
