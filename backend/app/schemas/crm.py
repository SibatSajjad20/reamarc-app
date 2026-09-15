from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


def _validate_url_scheme(val: Optional[str]) -> Optional[str]:
    if not val:
        return None
    cleaned = str(val).strip()
    lower = cleaned.lower()
    if lower.startswith("javascript:") or lower.startswith("data:") or lower.startswith("vbscript:"):
        raise ValueError("Insecure URL scheme.")
    if not (lower.startswith("http://") or lower.startswith("https://") or lower.startswith("/")):
        raise ValueError("URL must start with https://, http://, or /")
    return cleaned


def _normalize_website(val: Optional[str]) -> Optional[str]:
    """Allow bare domains; prepend https:// when scheme is missing."""
    if not val:
        return None
    cleaned = str(val).strip()
    if not cleaned:
        return None
    lower = cleaned.lower()
    if lower.startswith("javascript:") or lower.startswith("data:") or lower.startswith("vbscript:"):
        raise ValueError("Insecure URL scheme.")
    if not (lower.startswith("http://") or lower.startswith("https://") or lower.startswith("/")):
        cleaned = f"https://{cleaned}"
    return cleaned



# Lead qualification pipeline (pre-commercial)
OPEN_STAGES = (
    "new",
    "contacted",
    "qualified",
    "session_booked",
    "session_done",
)

# Legacy lead stages remapped onto deals during migration
LEGACY_LEAD_STAGES = ("proposal_sent", "negotiation")

# Deal commercial pipeline (open stages only; won/lost are status columns)
DEAL_OPEN_STAGES = (
    "opportunity_created",
    "requirement_confirmed",
    "proposal_sent",
    "negotiation",
    "verbal_approval",
    "contract_sent",
    "contract_signed",
    "payment_pending",
    "payment_done",
)

DEAL_STATUSES = ("open", "won", "lost")

DEAL_TYPES = ("new_business", "upsell", "renewal")

DEAL_PAYMENT_STATUSES = ("pending", "partial", "cleared")

DEAL_CURRENCIES = ("PKR", "USD")

DEAL_LOST_REASONS = (
    "budget",
    "timing",
    "competitor",
    "no_response",
    "not_a_fit",
    "scope_mismatch",
    "other",
)

OUTCOMES = ("won", "lost", "disqualified")
DISQUALIFY_REASONS = ("spam", "test", "competitor", "duplicate", "unqualified")
LEAD_LOST_REASONS = (
    "budget",
    "timing",
    "competitor",
    "no_response",
    "not_a_fit",
    "unqualified",
    "other",
)


class CrmAttribution(BaseModel):
    platform: Optional[str] = None
    campaign: Optional[str] = None
    campaign_id: Optional[str] = None
    adset: Optional[str] = None
    adset_id: Optional[str] = None
    ad: Optional[str] = None
    ad_id: Optional[str] = None
    form_id: Optional[str] = None
    form_name: Optional[str] = None
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    utm_content: Optional[str] = None
    utm_term: Optional[str] = None
    click_id: Optional[str] = None
    referrer: Optional[str] = None


class CrmLeadCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    phone: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    website: Optional[str] = None
    city: Optional[str] = None
    service: Optional[str] = None
    budget: Optional[str] = None
    source: str = Field(default="manual", max_length=80)
    campaign: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    note: Optional[str] = None
    assigned_to: Optional[str] = None
    next_follow_up_at: Optional[str] = None
    attribution: Optional[CrmAttribution] = None

    @field_validator("website")
    @classmethod
    def validate_website(cls, v: Optional[str]) -> Optional[str]:
        return _normalize_website(v)


class CrmLeadUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=160)
    phone: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    website: Optional[str] = None
    city: Optional[str] = None
    service: Optional[str] = None
    budget: Optional[str] = None
    source: Optional[str] = None
    campaign: Optional[str] = None
    tags: Optional[List[str]] = None
    stage: Optional[str] = None
    next_follow_up_at: Optional[str] = None
    proposal_config: Optional[Dict[str, Any]] = None
    attribution: Optional[CrmAttribution] = None

    @field_validator("website")
    @classmethod
    def validate_lead_update_website(cls, v: Optional[str]) -> Optional[str]:
        return _normalize_website(v)

    @field_validator("proposal_config")
    @classmethod
    def validate_proposal_config(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not v or not isinstance(v, dict):
            return v
        if "proposal_url" in v and v["proposal_url"]:
            v["proposal_url"] = _validate_url_scheme(str(v["proposal_url"]))
        return v


class CrmAssignRequest(BaseModel):
    user_id: str = Field(..., min_length=1)


class CrmDisqualifyRequest(BaseModel):
    reason: str = Field(default="spam")
    note: Optional[str] = None


class CrmOutcomeRequest(BaseModel):
    outcome: str = Field(..., description="won or lost")
    note: Optional[str] = None
    reason: Optional[str] = Field(
        None,
        description="Required when outcome=lost. One of LEAD_LOST_REASONS.",
    )


class CrmNoteRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)


class CrmActivityResponse(BaseModel):
    id: str
    lead_id: str
    type: str
    body: str
    actor_id: Optional[str] = None
    actor_name: Optional[str] = None
    created_at: str
    meta: Dict[str, Any] = Field(default_factory=dict)


class CrmLeadResponse(BaseModel):
    id: str
    name: str
    company: Optional[str] = None
    website: Optional[str] = None
    email: Optional[str] = None
    phone_raw: Optional[str] = None
    phone_e164: Optional[str] = None
    phone_valid: bool = False
    wa_url: Optional[str] = None
    city: Optional[str] = None
    service: Optional[str] = None
    budget: Optional[str] = None
    source: str = "manual"
    campaign: Optional[str] = None
    stage: str = "new"
    outcome: Optional[str] = None
    disqualify_reason: Optional[str] = None
    lost_reason: Optional[str] = None
    approval_status: Optional[str] = None
    payment_cleared: bool = False
    proposal_config: Optional[Dict[str, Any]] = None
    deals: List[Dict[str, Any]] = Field(default_factory=list)
    deals_count: int = 0
    total_deal_value: float = 0.0
    assigned_to: Optional[str] = None
    assigned_to_name: Optional[str] = None
    assigned_at: Optional[str] = None
    contacted: bool = False
    contacted_at: Optional[str] = None
    whatsapp_opened_at: Optional[str] = None
    last_activity_at: Optional[str] = None
    next_follow_up_at: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    converted_workspace_id: Optional[str] = None
    created_by: Optional[str] = None
    created_at: str
    updated_at: str
    attribution: Optional[CrmAttribution] = None


class CrmLeadDetailResponse(CrmLeadResponse):
    activities: List[CrmActivityResponse] = Field(default_factory=list)


class CrmApproveWonRequest(BaseModel):
    payment_cleared: bool = True
    workspace_name: Optional[str] = None
    brand_color: Optional[str] = None
    services: Optional[List[str]] = None
    project_cycle: Optional[str] = None
    note: Optional[str] = None


class CrmReopenRequest(BaseModel):
    target_stage: Optional[str] = "contacted"
    note: Optional[str] = None


class CrmDealCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=160)
    service: str = Field(..., min_length=1, max_length=80)
    additional_services: List[str] = Field(default_factory=list)
    value: float = Field(default=0.0, ge=0.0)
    currency: str = Field(default="PKR", max_length=10)
    billing_type: str = Field(default="one_time", max_length=40)
    stage: Optional[str] = Field(default="opportunity_created", max_length=40)
    status: str = Field(default="open", max_length=40)
    deal_type: str = Field(default="new_business", max_length=40)
    probability: float = Field(default=50.0, ge=0.0, le=100.0)
    expected_revenue: Optional[float] = Field(default=None, ge=0.0)
    expected_close_date: Optional[str] = None
    payment_status: str = Field(default="pending", max_length=40)
    proposal_url: Optional[str] = None
    proposal_name: Optional[str] = None
    proposal_size: Optional[int] = None
    notes: Optional[str] = None
    # Workspace draft (used on won → Active Client conversion)
    workspace_name: Optional[str] = None
    brand_color: Optional[str] = None
    priority: Optional[str] = None
    contract_start_date: Optional[str] = None
    contract_end_date: Optional[str] = None
    poc_name: Optional[str] = None
    poc_email: Optional[str] = None
    poc_phone: Optional[str] = None
    billing_name: Optional[str] = None
    billing_email: Optional[str] = None
    billing_phone: Optional[str] = None
    next_follow_up_at: Optional[str] = None
    budget_display: Optional[str] = None

    @field_validator("proposal_url")
    @classmethod
    def validate_deal_proposal_url(cls, v: Optional[str]) -> Optional[str]:
        return _validate_url_scheme(v)

    @field_validator("stage")
    @classmethod
    def validate_deal_create_stage(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return "opportunity_created"
        if v not in DEAL_OPEN_STAGES:
            raise ValueError(f"Invalid deal stage. Expected one of: {', '.join(DEAL_OPEN_STAGES)}")
        return v

    @field_validator("status")
    @classmethod
    def validate_deal_create_status(cls, v: str) -> str:
        if v not in DEAL_STATUSES:
            raise ValueError(f"Invalid deal status. Expected one of: {', '.join(DEAL_STATUSES)}")
        return v

    @field_validator("deal_type")
    @classmethod
    def validate_deal_type(cls, v: str) -> str:
        if v not in DEAL_TYPES:
            raise ValueError(f"Invalid deal type. Expected one of: {', '.join(DEAL_TYPES)}")
        return v

    @field_validator("payment_status")
    @classmethod
    def validate_payment_status(cls, v: str) -> str:
        if v not in DEAL_PAYMENT_STATUSES:
            raise ValueError(f"Invalid payment status. Expected one of: {', '.join(DEAL_PAYMENT_STATUSES)}")
        return v

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        code = (v or "PKR").strip().upper()
        if code not in DEAL_CURRENCIES:
            raise ValueError(f"Invalid currency. Expected one of: {', '.join(DEAL_CURRENCIES)}")
        return code


class CrmDealUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=160)
    service: Optional[str] = Field(None, min_length=1, max_length=80)
    additional_services: Optional[List[str]] = None
    value: Optional[float] = Field(None, ge=0.0)
    currency: Optional[str] = Field(None, max_length=10)
    billing_type: Optional[str] = Field(None, max_length=40)
    stage: Optional[str] = Field(None, max_length=40)
    status: Optional[str] = Field(None, max_length=40)
    deal_type: Optional[str] = Field(None, max_length=40)
    probability: Optional[float] = Field(None, ge=0.0, le=100.0)
    expected_revenue: Optional[float] = Field(None, ge=0.0)
    expected_close_date: Optional[str] = None
    payment_status: Optional[str] = Field(None, max_length=40)
    proposal_url: Optional[str] = None
    proposal_name: Optional[str] = None
    proposal_size: Optional[int] = None
    notes: Optional[str] = None
    workspace_name: Optional[str] = None
    brand_color: Optional[str] = None
    priority: Optional[str] = None
    contract_start_date: Optional[str] = None
    contract_end_date: Optional[str] = None
    poc_name: Optional[str] = None
    poc_email: Optional[str] = None
    poc_phone: Optional[str] = None
    billing_name: Optional[str] = None
    billing_email: Optional[str] = None
    billing_phone: Optional[str] = None
    next_follow_up_at: Optional[str] = None
    budget_display: Optional[str] = None
    lost_reason: Optional[str] = None

    @field_validator("proposal_url")
    @classmethod
    def validate_deal_update_proposal_url(cls, v: Optional[str]) -> Optional[str]:
        return _validate_url_scheme(v)

    @field_validator("stage")
    @classmethod
    def validate_deal_update_stage(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v not in DEAL_OPEN_STAGES:
            raise ValueError(f"Invalid deal stage. Expected one of: {', '.join(DEAL_OPEN_STAGES)}")
        return v

    @field_validator("status")
    @classmethod
    def validate_deal_update_status(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v not in DEAL_STATUSES:
            raise ValueError(f"Invalid deal status. Expected one of: {', '.join(DEAL_STATUSES)}")
        return v

    @field_validator("deal_type")
    @classmethod
    def validate_deal_update_type(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v not in DEAL_TYPES:
            raise ValueError(f"Invalid deal type. Expected one of: {', '.join(DEAL_TYPES)}")
        return v

    @field_validator("payment_status")
    @classmethod
    def validate_deal_update_payment(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v not in DEAL_PAYMENT_STATUSES:
            raise ValueError(f"Invalid payment status. Expected one of: {', '.join(DEAL_PAYMENT_STATUSES)}")
        return v

    @field_validator("currency")
    @classmethod
    def validate_deal_update_currency(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        code = v.strip().upper()
        if code not in DEAL_CURRENCIES:
            raise ValueError(f"Invalid currency. Expected one of: {', '.join(DEAL_CURRENCIES)}")
        return code


class CrmDealOutcomeRequest(BaseModel):
    note: Optional[str] = None
    reason: Optional[str] = Field(
        None,
        description="Required when marking lost. One of DEAL_LOST_REASONS.",
    )


class CrmDealReopenRequest(BaseModel):
    target_stage: Optional[str] = Field(default="opportunity_created", max_length=40)
    note: Optional[str] = None


class CrmDealApproveWonRequest(BaseModel):
    payment_cleared: bool = True
    workspace_name: Optional[str] = None
    brand_color: Optional[str] = None
    services: Optional[List[str]] = None
    project_cycle: Optional[str] = None
    note: Optional[str] = None
    workspace_id: Optional[str] = None


class CrmDealLeadSnapshot(BaseModel):
    id: str
    name: str = ""
    company: Optional[str] = None
    email: Optional[str] = None
    phone_e164: Optional[str] = None
    phone_raw: Optional[str] = None
    assigned_to: Optional[str] = None
    assigned_to_name: Optional[str] = None
    stage: Optional[str] = None


class CrmDealResponse(BaseModel):
    id: str
    lead_id: str
    title: str
    service: str
    additional_services: List[str] = Field(default_factory=list)
    value: float = 0.0
    currency: str = "PKR"
    billing_type: str = "one_time"
    stage: str = "opportunity_created"
    status: str = "open"
    deal_type: str = "new_business"
    probability: float = 50.0
    expected_revenue: float = 0.0
    expected_close_date: Optional[str] = None
    payment_status: str = "pending"
    lost_reason: Optional[str] = None
    approval_status: Optional[str] = None
    payment_cleared: bool = False
    proposal_url: Optional[str] = None
    proposal_name: Optional[str] = None
    proposal_size: Optional[int] = None
    notes: Optional[str] = None
    workspace_name: Optional[str] = None
    brand_color: Optional[str] = None
    priority: Optional[str] = None
    contract_start_date: Optional[str] = None
    contract_end_date: Optional[str] = None
    poc_name: Optional[str] = None
    poc_email: Optional[str] = None
    poc_phone: Optional[str] = None
    billing_name: Optional[str] = None
    billing_email: Optional[str] = None
    billing_phone: Optional[str] = None
    next_follow_up_at: Optional[str] = None
    budget_display: Optional[str] = None
    converted_workspace_id: Optional[str] = None
    created_at: str
    updated_at: str
    lead: Optional[CrmDealLeadSnapshot] = None


class CrmDealListResponse(BaseModel):
    deals: List[CrmDealResponse] = Field(default_factory=list)
    total_count: int = 0
    total_value: float = 0.0


class CrmLeadListResponse(BaseModel):
    items: List[CrmLeadResponse]
    total: int


class CrmCountsResponse(BaseModel):
    incoming: int = 0
    assigned: int = 0
    uncontacted: int = 0
    opened_not_confirmed: int = 0
    contacted_under_15m: int = 0
    won: int = 0
    lost: int = 0
    win_rate: Optional[float] = None  # won / (won + lost); disqualified excluded


class CrmConvertRequest(BaseModel):
    workspace_id: Optional[str] = Field(
        None,
        description="Link an existing Active Client workspace; omit to create one from the lead.",
    )


class CrmPipelineStage(BaseModel):
    id: str
    name: str
    order: int


class CrmPipelineResponse(BaseModel):
    stages: List[CrmPipelineStage]
    outcomes: List[str] = Field(default_factory=lambda: list(OUTCOMES))


class CrmDealPipelineResponse(BaseModel):
    stages: List[CrmPipelineStage]
    statuses: List[str] = Field(default_factory=lambda: list(DEAL_STATUSES))


class CrmAssigneeResponse(BaseModel):
    id: str
    full_name: str
    email: str
    role: str
    department: Optional[str] = None


class CrmRuleCondition(BaseModel):
    field: str = Field(..., description="source | campaign | city | service")
    op: str = Field(default="eq", description="eq | in | contains")
    value: Any = ""


class CrmRuleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    enabled: bool = True
    priority: int = Field(default=100, ge=1, le=9999)
    method: str = Field(default="round_robin")
    pool: List[str] = Field(default_factory=list)
    fallback_user_id: Optional[str] = None
    after_hours: str = Field(default="claim")
    conditions: List[CrmRuleCondition] = Field(default_factory=list)


class CrmRuleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    enabled: Optional[bool] = None
    priority: Optional[int] = Field(None, ge=1, le=9999)
    method: Optional[str] = None
    pool: Optional[List[str]] = None
    fallback_user_id: Optional[str] = None
    after_hours: Optional[str] = None
    conditions: Optional[List[CrmRuleCondition]] = None


class CrmRuleResponse(BaseModel):
    id: str
    name: str
    enabled: bool = True
    priority: int = 100
    method: str = "round_robin"
    pool: List[str] = Field(default_factory=list)
    fallback_user_id: Optional[str] = None
    after_hours: str = "claim"
    conditions: List[Dict[str, Any]] = Field(default_factory=list)
    cursor: int = 0
    updated_at: Optional[str] = None


class CrmTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    body: str = Field(..., min_length=1, max_length=2000)
    is_default: bool = False


class CrmTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    body: Optional[str] = Field(None, min_length=1, max_length=2000)
    is_default: Optional[bool] = None


class CrmTemplateResponse(BaseModel):
    id: str
    name: str
    body: str
    is_default: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class CrmWhatsAppOpenRequest(BaseModel):
    template_id: Optional[str] = None


class CrmWhatsAppOpenResponse(CrmLeadResponse):
    wa_url: Optional[str] = None
    rendered_text: Optional[str] = None
    template_id: Optional[str] = None
    template_name: Optional[str] = None


class CrmFollowUpRequest(BaseModel):
    next_follow_up_at: Optional[str] = Field(
        None,
        description="ISO datetime, or null to clear",
    )


class CrmIngestSourceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    kind: str = Field(default="webhook", max_length=40)
    default_source: str = Field(default="website", max_length=80)
    default_campaign: Optional[str] = Field(None, max_length=120)


class CrmIngestSourceUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    enabled: Optional[bool] = None
    default_source: Optional[str] = Field(None, max_length=80)
    default_campaign: Optional[str] = Field(None, max_length=120)


class CrmIngestSourceResponse(BaseModel):
    id: str
    name: str
    kind: str = "webhook"
    enabled: bool = True
    default_source: str = "website"
    default_campaign: Optional[str] = None
    token_prefix: str = ""
    ingest_path: Optional[str] = None
    token: Optional[str] = None
    created_by: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""
    last_used_at: Optional[str] = None
    hit_count: int = 0


class CrmPublicIngestAck(BaseModel):
    id: str
    created: bool = True
    duplicate: bool = False


class CrmIngestResponse(BaseModel):
    lead: CrmLeadResponse
    created: bool = True
    duplicate: bool = False
