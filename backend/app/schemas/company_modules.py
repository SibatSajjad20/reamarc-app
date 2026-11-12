from typing import List, Optional

from pydantic import BaseModel, Field


class CompanyModulesPut(BaseModel):
    enabled_modules: List[str] = Field(..., min_length=1)


class CompanyModulesResponse(BaseModel):
    company_id: str
    enabled_modules: Optional[List[str]] = None
    all_modules: List[str]
    is_default: bool
