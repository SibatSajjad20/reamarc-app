import warnings
from typing import Optional, Union, List
from pydantic import BaseModel, Field, ConfigDict

# Filter Pydantic warning for field 'copy' which is domain-specific copywriting terminology
warnings.filterwarnings(
    "ignore",
    category=UserWarning,
    message=r'.*Field name "copy" in .* shadows an attribute in parent "BaseModel"'
)

class PostResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    id: Union[str, int]
    campaign: str
    campaign_id: Optional[str] = None
    target_date: Optional[str] = None
    platform: str
    date: str
    dayNumber: int
    workspaceId: str
    status: str
    targetAudience: str
    copy: str
    lastModified: str
    versions: Optional[List[str]] = None

class PostSaveDraft(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    copy: str = Field(..., max_length=10000, description="Updated copy content (max 10000 chars)")

class PolishRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    copy: str = Field(..., max_length=5000, description="Copy text to polish (max 5000 chars)")
    action_type: str = Field(..., description="One of: punchy, emojis, hashtags, fix, creative_angle")
    platform: str = "LinkedIn"

class BulkPostAction(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    post_ids: List[Union[str, int]] = Field(..., description="List of post IDs for bulk operation")

class FeedbackRewriteRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    feedback: str = Field(..., min_length=2, max_length=2000, description="User's review notes and instructions")
    preset_tags: Optional[List[str]] = Field(default=[], description="Selected feedback preset tags")

