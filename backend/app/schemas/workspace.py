from pydantic import BaseModel, Field
from typing import Optional

class WorkspaceCreate(BaseModel):
    name: str = Field(..., example="Nova Luxury Living")
    initials: Optional[str] = Field(None, example="NL")
    brandColor: Optional[str] = Field("bg-indigo-500", example="bg-indigo-500")
    industry: Optional[str] = Field("General B2B", example="Real Estate")
    brandGuidelines: Optional[str] = Field(None, example="Brand guidelines text...")

class WorkspaceUpdate(BaseModel):
    name: Optional[str] = Field(None)
    initials: Optional[str] = Field(None)
    brandColor: Optional[str] = Field(None)
    industry: Optional[str] = Field(None)
    brandGuidelines: Optional[str] = Field(None)

class GuidelinesUpdate(BaseModel):
    guidelines_text: str = Field(..., example="Brand voice, tone, guidelines...")

class WorkspaceResponse(BaseModel):
    id: str
    name: str
    initials: str
    brandColor: str
    industry: str
    brandGuidelines: Optional[str] = ""
    isDefault: bool = False

    class Config:
        populate_by_name = True

