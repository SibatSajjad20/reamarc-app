"""
Pydantic schemas and option definitions for Content Calendar module.
Mirrors all fields and options from 'Apex Campaign Content Plan.xlsx'.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from urllib.parse import urlparse
from pydantic import BaseModel, Field, field_validator

from app.services.content_calendar_workflow import (
    ACTIONS,
    DEFAULT_STAGE,
    PIPELINE_STAGES,
    resolve_stage,
)

TEXT_LIMITS = {
    "serial": 40,
    "client_name": 160,
    "campaign_type": 120,
    "creative_type": 40,
    "content_pillar": 80,
    "content_concept": 300,
    "offer": 160,
    "production_direction": 4000,
    "primary_text": 8000,
    "headlines_hooks": 4000,
    "content_on_creative": 4000,
    "cta": 160,
    "captions_hashtags": 2000,
    "design_owner": 80,
    "design_due": 80,
    "notes": 8000,
    "approval_status": 80,
    "setup_status": 40,
    "workspace_id": 80,
    "publish_date": 10,
    "draft_preview_link": 2000,
    "final_asset_link": 2000,
}


def clean_http_link(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if len(text) > TEXT_LIMITS["draft_preview_link"]:
        raise ValueError("Link must be 2000 characters or fewer")
    parsed = urlparse(text)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Links must be http or https URLs")
    if parsed.username or parsed.password:
        raise ValueError("Links must not include a username or password")
    return text


def clamp_text(field: str, value: Any) -> Any:
    if field in {"draft_preview_link", "final_asset_link"}:
        return clean_http_link(value)
    if not isinstance(value, str):
        return value
    text = value.strip()
    limit = TEXT_LIMITS.get(field)
    if limit is not None and len(text) > limit:
        raise ValueError(f"{field} must be {limit} characters or fewer")
    if field == "publish_date" and text:
        try:
            datetime.strptime(text, "%Y-%m-%d")
        except ValueError as exc:
            raise ValueError("Publish date must be YYYY-MM-DD") from exc
    if field == "content_concept" and not text:
        raise ValueError("Content concept is required")
    return text


def _check_stage(value: Any) -> str:
    resolved = resolve_stage(None if value is None else str(value))
    if resolved is None:
        raise ValueError(f"Unknown stage '{value}'")
    return resolved

# Allowed dropdown constants extracted from Excel
CAMPAIGN_TYPE_OPTIONS = [
    # Acquire
    "Acquire \u2013 Cold Audience Awareness",
    "Acquire \u2013 Cold Audience Targeting",
    "Acquire \u2013 Warm Audience Retargeting",
    "Acquire \u2013 First Order Purchase Retargeting",
    "Acquire \u2013 Product Remarketing",
    # Expand
    "Expand \u2013 Repeat Purchase / Reorder",
    "Expand \u2013 Upsell / Cross-Sell",
    "Expand \u2013 Premium / New Product",
    "Expand \u2013 Seasonal",
    "Expand \u2013 High-Value / Loyalty",
    "Expand \u2013 Reactivation",
    # Multiply
    "Multiply \u2013 Referral / Ambassador",
    "Multiply \u2013 Testimonials / Success Stories",
    "Multiply \u2013 UGC / Social Sharing",
    "Multiply \u2013 Community Building",
    "Multiply \u2013 Reviews / Advocacy",
]

CREATIVE_TYPE_OPTIONS = [
    "Video",
    "Reel",
    "Carousel",
    "Static",
    "Story",
    "UGC",
    "Testimonial",
    "GIF",
    "LP Graphic",
    "Banner",
    "Email",
    "Lead Magnet",
]

CONTENT_PILLAR_OPTIONS = [
    "Industry Demand",
    "Production Advantage",
    "Business Growth",
    "Comparison",
    "Product",
    "Customer Success",
    "Educational",
    "Partnership",
]

OFFER_OPTIONS = [
    # Acquire
    "Sample Pack",
    "Wholesale Account",
    "Instant Quote",
    "Production Consultation",
    "Lead Magnet (Guide)",
    # Expand
    "Reorder Reminder",
    "Upsell Bundle (Gang Sheets / Art / Rush)",
    "Cross-Sell Bundle (Art / Embroidery / Gang Sheets)",
    "Premium Product Upgrade",
    "New Product Launch",
    "Seasonal Promotion",
    "VIP / High-Value Perks",
    "Loyalty Rewards",
    "Reactivation Offer",
    # Multiply
    "Referral Reward",
    "Ambassador Program",
    "Review Incentive",
    "UGC Feature / Spotlight",
    "Community Invite",
    "Case Study Feature",
]

CTA_OPTIONS = [
    # Acquire
    "Request Your Sample Pack",
    "Become an Apex Decorator Partner",
    "Get an Instant Quote",
    "Book a Production Consultation",
    "Compare Apex",
    "Download the Guide",
    "Talk to Our Team",
    # Expand
    "Reorder Now",
    "Restock Your Supplies",
    "Upgrade Your Order",
    "Explore Gang Sheets",
    "Explore Art Services",
    "Shop New Products",
    "Order for the Season",
    "Claim Your VIP Perks",
    "Join the Loyalty Program",
    "Come Back & Save",
    # Multiply
    "Refer & Earn",
    "Share Your Story",
    "Leave a Review",
    "Join the Community",
    "Become an Ambassador",
    "Share Your Project",
    "Read the Case Study",
    "Tag Us",
]

APPROVAL_STATUS_OPTIONS = [
    "Content Draft",
    "Review Content",
    "Content Internal Review",
    "Content Client Review",
    "Content Approved",
    "Start Production",
    "Creative Production",
    "Review Creative Draft",
    "Creative Internal Review",
    "Creative Client Review",
    "Creative Approved",
    "Content Revision",
    "Creative Revision",
    "Changes Requested",
    "Approved for Campaign",
    "Ready to Post",
    "Posted",
    "Rejected",
]

SETUP_STATUS_OPTIONS = [
    "Not Started",
    "In Setup",
    "Live",
    "Paused",
]

DESIGN_OWNER_OPTIONS = [
    "Content",
    "Creative",
    "Social Media",
]


class CreativeAsset(BaseModel):
    id: str = Field(..., description="Unique asset identifier")
    url: str = Field(..., description="Relative or absolute access URL")
    filename: str = Field(..., description="Original filename")
    size_bytes: int = Field(default=0, ge=0)
    content_type: str = Field(..., description="MIME content type")
    kind: str = Field(default="image", description="Asset kind: image, video, document, other")
    role: str = Field(default="primary", description="Asset role: primary, carousel_slide, reference, copy_doc, script")
    order: int = Field(default=0, ge=0, description="Display order index (0-indexed)")
    uploaded_at: str = Field(..., description="ISO 8601 upload timestamp")
    uploaded_by: Optional[str] = Field(default=None, description="User name or email")
    width: Optional[int] = Field(default=None, description="Image/video pixel width")
    height: Optional[int] = Field(default=None, description="Image/video pixel height")
    duration_seconds: Optional[float] = Field(default=None, description="Video duration in seconds")
    thumbnail_url: Optional[str] = Field(default=None, description="Thumbnail URL if generated")


class AssetReorderRequest(BaseModel):
    asset_ids: List[str] = Field(..., description="Ordered list of asset IDs")


class LinkAssetCreate(BaseModel):
    url: str = Field(..., max_length=2000, description="Web URL")
    title: str = Field(..., max_length=200, description="Title or label for the link")
    role: str = Field(default="primary", description="Role for deliverable link")


class ContentCalendarItemBase(BaseModel):
    serial: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["serial"], description="Serial ID, e.g. CAT-001")
    client_name: Optional[str] = Field(default="Apex Transfers LLC", max_length=TEXT_LIMITS["client_name"])
    campaign_type: Optional[str] = Field(default="Acquire \u2013 Cold Audience Awareness", max_length=TEXT_LIMITS["campaign_type"])
    creative_type: Optional[str] = Field(default="Video", max_length=TEXT_LIMITS["creative_type"])
    content_pillar: Optional[str] = Field(default="Production Advantage", max_length=TEXT_LIMITS["content_pillar"])
    content_concept: str = Field(..., max_length=TEXT_LIMITS["content_concept"], description="Content concept or title")
    offer: Optional[str] = Field(default="Sample Pack", max_length=TEXT_LIMITS["offer"])
    production_direction: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["production_direction"])
    primary_text: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["primary_text"])
    headlines_hooks: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["headlines_hooks"])
    content_on_creative: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["content_on_creative"])
    cta: Optional[str] = Field(default="Request Your Sample Pack", max_length=TEXT_LIMITS["cta"])
    captions_hashtags: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["captions_hashtags"])
    design_owner: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["design_owner"])
    design_due: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["design_due"])
    draft_preview_link: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["draft_preview_link"])
    final_asset_link: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["final_asset_link"])
    approval_status: Optional[str] = Field(default="Content Draft", max_length=TEXT_LIMITS["approval_status"])
    setup_status: Optional[str] = Field(default="Not Started", max_length=TEXT_LIMITS["setup_status"])
    notes: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["notes"])
    notes_author: Optional[str] = Field(default=None, max_length=160, description="User who wrote or last updated comments")
    notes_updated_at: Optional[str] = Field(default=None, description="ISO timestamp when comment was added/updated")
    stage: str = Field(default=DEFAULT_STAGE, description="Pipeline stage")
    publish_date: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["publish_date"], description="ISO date YYYY-MM-DD")
    channels: Optional[List[str]] = Field(default_factory=list, max_length=12)
    workspace_id: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["workspace_id"])
    attachments: Optional[List[CreativeAsset]] = Field(default_factory=list, description="Uploaded creative media, slides, or documents")

    @field_validator("stage")
    @classmethod
    def validate_stage(cls, v: str) -> str:
        return _check_stage(v)

    @field_validator("content_concept")
    @classmethod
    def validate_concept(cls, v: str) -> str:
        return clamp_text("content_concept", v)

    @field_validator("draft_preview_link", "final_asset_link")
    @classmethod
    def validate_links(cls, v: Optional[str]) -> Optional[str]:
        return clean_http_link(v)

    @field_validator("publish_date")
    @classmethod
    def validate_publish_date(cls, v: Optional[str]) -> Optional[str]:
        return clamp_text("publish_date", v) if v else v


class ContentCalendarItemCreate(ContentCalendarItemBase):
    pass


class ContentCalendarItemUpdate(BaseModel):
    serial: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["serial"])
    client_name: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["client_name"])
    campaign_type: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["campaign_type"])
    creative_type: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["creative_type"])
    content_pillar: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["content_pillar"])
    content_concept: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["content_concept"])
    offer: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["offer"])
    production_direction: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["production_direction"])
    primary_text: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["primary_text"])
    headlines_hooks: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["headlines_hooks"])
    content_on_creative: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["content_on_creative"])
    cta: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["cta"])
    captions_hashtags: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["captions_hashtags"])
    design_owner: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["design_owner"])
    design_due: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["design_due"])
    draft_preview_link: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["draft_preview_link"])
    final_asset_link: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["final_asset_link"])
    approval_status: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["approval_status"])
    setup_status: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["setup_status"])
    notes: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["notes"])
    publish_date: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["publish_date"])
    channels: Optional[List[str]] = Field(default=None, max_length=12)
    workspace_id: Optional[str] = Field(default=None, max_length=TEXT_LIMITS["workspace_id"])
    attachments: Optional[List[CreativeAsset]] = Field(default=None)

    @field_validator("content_concept")
    @classmethod
    def validate_concept(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return clamp_text("content_concept", v)

    @field_validator("draft_preview_link", "final_asset_link")
    @classmethod
    def validate_links(cls, v: Optional[str]) -> Optional[str]:
        return clean_http_link(v)

    @field_validator("publish_date")
    @classmethod
    def validate_publish_date(cls, v: Optional[str]) -> Optional[str]:
        return clamp_text("publish_date", v) if v else v


class StageMoveRequest(BaseModel):
    action: str = Field(..., description="submit, approve, send_back, request_revision, post, reject, return_to_creative, assign, or admin_move")
    note: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    target_stage: Optional[str] = None

    @field_validator("action")
    @classmethod
    def validate_action(cls, v: str) -> str:
        key = str(v or "").lower().strip().replace(" ", "_")
        if key not in ACTIONS:
            raise ValueError(f"Invalid action '{v}'. Must be one of: {sorted(ACTIONS)}")
        return key


class ContentCalendarItemResponse(ContentCalendarItemBase):
    id: str
    created_at: str
    updated_at: str
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    submitted_from: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    revision_note: Optional[str] = None
    share_token: Optional[str] = None


class ContentCalendarListResponse(BaseModel):
    items: List[ContentCalendarItemResponse]
    total: int
    stages_count: Dict[str, int]


class ContentCalendarConstantsResponse(BaseModel):
    campaign_types: List[str]
    creative_types: List[str]
    content_pillars: List[str]
    offers: List[str]
    ctas: List[str]
    approval_statuses: List[str]
    setup_statuses: List[str]
    pipeline_stages: List[str]
    design_owners: Optional[List[str]] = None


class ContentCalendarConstantsUpdate(BaseModel):
    creative_types: Optional[List[str]] = None
    campaign_types: Optional[List[str]] = None
    content_pillars: Optional[List[str]] = None
    offers: Optional[List[str]] = None
    ctas: Optional[List[str]] = None
    approval_statuses: Optional[List[str]] = None
    setup_statuses: Optional[List[str]] = None
    design_owners: Optional[List[str]] = None


class BatchUpdateItem(BaseModel):
    id: str = Field(..., description="ID or Serial of the item to update")
    changes: Dict[str, Any] = Field(..., description="Key-value pairs of fields to update")


class BatchUpdateRequest(BaseModel):
    updates: List[BatchUpdateItem] = Field(..., max_length=500, description="List of items and their field updates")


class BulkImportRequest(BaseModel):
    items: List[ContentCalendarItemCreate] = Field(..., max_length=1000, description="List of content calendar items to import")
    upsert_by_serial: bool = Field(default=True, description="Update existing records matching serial if True")
    default_client_name: Optional[str] = Field(default="Apex Transfers LLC", description="Client name fallback")


class BulkImportResponse(BaseModel):
    total_processed: int
    inserted_count: int
    updated_count: int
    errors: List[str] = []

