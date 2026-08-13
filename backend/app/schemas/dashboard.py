"""
Pydantic Schemas for Executive Command Center Dashboard API.
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class PerformanceKPIs(BaseModel):
    ad_spend: float = Field(0.0, description="Aggregate ad spend for date range")
    leads_conversions: int = Field(0, description="Total leads / conversions for date range")
    blended_cpa: float = Field(0.0, description="Blended Cost Per Acquisition (Ad Spend / Conversions)")
    active_campaigns_count: int = Field(0, description="Count of active campaigns")
    currency: str = Field("USD", description="Primary currency code (USD, PKR, GBP, EUR, AED)")
    currency_symbol: str = Field("$", description="Currency symbol for display")
    is_normalized: bool = Field(False, description="True if converted to normalized USD from multi-currency accounts")


class ActionQueueItem(BaseModel):
    id: str
    title: str
    workspace_name: str
    status: str
    updated_at: Optional[str] = None
    platform: Optional[str] = None
    message: Optional[str] = None


class ActionQueue(BaseModel):
    pending_approvals: List[ActionQueueItem] = Field(default_factory=list, description="Campaigns/Assets pending approval (limit 5)")
    system_alerts: List[ActionQueueItem] = Field(default_factory=list, description="Campaigns in Error or WITH_ISSUES state")


class RAGFileSummary(BaseModel):
    id: str
    name: str
    type: str
    workspace_name: str
    date_added: str


class WorkspaceHealth(BaseModel):
    total_workspaces: int = Field(0, description="Count of active workspaces")
    total_users: int = Field(0, description="Count of total registered users")
    recent_rag_files: List[RAGFileSummary] = Field(default_factory=list, description="3 most recently synced Obsidian/RAG files")


class DashboardSummaryResponse(BaseModel):
    performance_kpis: PerformanceKPIs
    action_queue: ActionQueue
    workspace_health: WorkspaceHealth
