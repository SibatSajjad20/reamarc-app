from pydantic import BaseModel, Field
from typing import Optional, List

class WorkspaceCreate(BaseModel):
    name: str = Field(..., example="Nova Luxury Living")
    initials: Optional[str] = Field(None, example="NL")
    brandColor: Optional[str] = Field("bg-indigo-600", example="bg-indigo-600")
    proposal_url: Optional[str] = None
    proposal_name: Optional[str] = None
    proposal_size: Optional[int] = None
    project_cycle: Optional[str] = Field("Retainer", example="Retainer")
    priority: Optional[str] = Field("Medium", example="High")
    contract_start_date: Optional[str] = None
    contract_end_date: Optional[str] = None
    services: Optional[List[str]] = Field(default_factory=list)
    health: Optional[str] = Field("Good", example="Excellent")
    poc_name: Optional[str] = None
    poc_email: Optional[str] = None
    poc_phone: Optional[str] = None
    billing_name: Optional[str] = None
    billing_email: Optional[str] = None
    billing_phone: Optional[str] = None
    brandGuidelines: Optional[str] = None

class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    initials: Optional[str] = None
    brandColor: Optional[str] = None
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
    brandGuidelines: Optional[str] = None

class GuidelinesUpdate(BaseModel):
    guidelines_text: str = Field(..., example="Brand voice, tone, guidelines...")

class WorkspaceResponse(BaseModel):
    id: str
    name: str
    initials: str
    brandColor: str
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
    brandGuidelines: Optional[str] = ""
    isDefault: bool = False

    class Config:
        populate_by_name = True
