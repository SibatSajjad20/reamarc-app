from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Any

class ErrorResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    detail: str = Field(..., description="Human-readable error explanation message")
    code: Optional[str] = Field(None, description="Domain-specific error code")
    extra: Optional[Any] = Field(None, description="Optional extra error details or validation context")
