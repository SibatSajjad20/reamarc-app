import warnings
from pydantic import BaseModel, Field, ConfigDict

# Filter Pydantic warning for field 'copy' which is domain-specific copywriting terminology
warnings.filterwarnings(
    "ignore",
    category=UserWarning,
    message=r'.*Field name "copy" in .* shadows an attribute in parent "BaseModel"'
)

class PostResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    
    id: int
    campaign: str
    platform: str
    date: str
    dayNumber: int
    workspaceId: str
    status: str
    targetAudience: str
    copy: str
    lastModified: str

class PostSaveDraft(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    
    copy: str

class PolishRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    
    copy: str
    action_type: str = Field(..., description="One of: punchy, emojis, hashtags, fix")
    platform: str = "LinkedIn"

