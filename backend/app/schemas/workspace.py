import re
from typing import Optional, List, Literal
from pydantic import BaseModel, Field, field_validator


class ContentExpectationLine(BaseModel):
    creative_type: str
    expected: Optional[int] = None
    expected_max: Optional[int] = None
    included: Optional[bool] = False
    layout: Optional[str] = None
    skip_months: Optional[List[str]] = None


class ContentExpectations(BaseModel):
    period: str = "month"
    lines: List[ContentExpectationLine] = Field(default_factory=list)


class ContentExpectationLineIn(BaseModel):
    creative_type: str = Field(..., max_length=40)
    expected: Optional[int] = Field(None, ge=0, le=500)
    expected_max: Optional[int] = Field(None, ge=0, le=500)
    included: Optional[bool] = False
    layout: Optional[str] = Field(None, max_length=20)
    skip_months: Optional[List[str]] = Field(None, max_length=24)

    @field_validator("skip_months")
    @classmethod
    def validate_skip_months(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return None
        pattern = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
        for m in v:
            if not isinstance(m, str) or not pattern.match(m):
                raise ValueError(f"Invalid skip_month format: {m}. Expected YYYY-MM.")
        return v


class ContentExpectationsIn(BaseModel):
    period: Literal["month"] = "month"
    lines: List[ContentExpectationLineIn] = Field(default_factory=list, max_length=30)



class WorkspaceCreate(BaseModel):
    name: str = Field(..., example="Nova Luxury Living")
    initials: Optional[str] = Field(None, example="NL")
    brandColor: Optional[str] = Field("bg-indigo-600", example="bg-indigo-600")
    status: Optional[str] = Field("active", example="active")
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
    content_expectations: Optional[ContentExpectationsIn] = None

class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    initials: Optional[str] = None
    brandColor: Optional[str] = None
    status: Optional[str] = None
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
    content_expectations: Optional[ContentExpectationsIn] = None

class GuidelinesUpdate(BaseModel):
    guidelines_text: str = Field(..., example="Brand voice, tone, guidelines...")

class WorkspaceResponse(BaseModel):
    id: str
    name: str
    initials: str
    brandColor: str
    status: Optional[str] = "active"
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
    logo_url: Optional[str] = None
    updated_at: Optional[str] = None
    content_expectations: Optional[ContentExpectations] = None

    class Config:
        populate_by_name = True
