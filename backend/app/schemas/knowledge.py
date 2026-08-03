from pydantic import BaseModel, Field

class KnowledgeSourceCreate(BaseModel):
    name: str = Field(..., min_length=2)
    type: str = Field("pdf", description="pdf or url")
    sizeOrTokens: str = Field("1.2 MB", description="e.g. 1.2 MB or 45k tokens")
    workspaceId: str = Field("ws-1")

class KnowledgeSourceResponse(BaseModel):
    id: str
    name: str
    type: str
    sizeOrTokens: str
    workspaceId: str
    dateAdded: str
    status: str
