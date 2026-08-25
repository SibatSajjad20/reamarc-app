from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class RegisterDeviceRequest(BaseModel):
    device_uuid: str = Field(..., min_length=8, max_length=128)
    device_name: Optional[str] = Field(default=None, max_length=120)
    platform: Literal["ios", "android"] = "android"
    push_token: Optional[str] = Field(default=None, max_length=512)


class MobileDeviceResponse(BaseModel):
    id: str
    user_id: str
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    device_uuid: str
    device_name: Optional[str] = None
    platform: str
    has_push_token: bool = False
    is_active: bool = True
    last_seen: Optional[str] = None
    created_at: Optional[str] = None


class TransferDeviceRequest(BaseModel):
    user_id: Optional[str] = Field(default=None)
    device_id: Optional[str] = Field(default=None)


class BroadcastPushRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    body: str = Field(..., min_length=1, max_length=500)
    user_ids: Optional[List[str]] = Field(
        default=None,
        description="If omitted or empty, send to every bound device with a push token.",
    )


class MobileNotificationResponse(BaseModel):
    id: str
    title: str
    body: str
    kind: str = "custom"
    sender_id: Optional[str] = None
    sender_name: Optional[str] = None
    sender_role: Optional[str] = None
    created_at: Optional[str] = None
    read: bool = False


class PushDispatchResponse(BaseModel):
    sent: int = 0
    skipped: int = 0
    in_app: int = 0
    message: str


class LiveEmployeeStatus(BaseModel):
    user_id: str
    name: str
    role: str
    department: str
    status: str
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    is_wfh: bool = False
    is_late: bool = False
    hours_worked: float = 0.0


class AdminOverviewResponse(BaseModel):
    date: str
    total_employees: int = 0
    present_count: int = 0
    on_time_count: int = 0
    late_count: int = 0
    wfh_count: int = 0
    leave_count: int = 0
    absent_count: int = 0
    pending_approvals_count: int = 0
    departments: List[dict] = Field(default_factory=list)
    employees: List[LiveEmployeeStatus] = Field(default_factory=list)

