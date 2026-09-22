from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.core.rate_limit_store import enforce_shared_rate_limit
from app.core.security import require_internal_user
from app.schemas.error import ErrorResponse
from app.services.web_push_service import (
    InvalidSubscription,
    WebPushConfigError,
    public_application_server_key,
    remove_subscription,
    send_web_push,
    upsert_subscription,
    web_push_configured,
)

router = APIRouter(
    prefix="/web-push",
    tags=["Web Push"],
    responses={
        400: {"model": ErrorResponse},
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)


class PushSubscriptionKeys(BaseModel):
    p256dh: str = Field(..., min_length=80, max_length=200)
    auth: str = Field(..., min_length=16, max_length=64)


class PushSubscribeRequest(BaseModel):
    endpoint: str = Field(..., min_length=20, max_length=4096)
    keys: PushSubscriptionKeys


class PushUnsubscribeRequest(BaseModel):
    endpoint: str = Field(..., min_length=20, max_length=4096)


@router.get("/vapid-public-key")
async def vapid_public_key(current_user: dict = Depends(require_internal_user)):
    if not web_push_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Browser notifications are not configured.",
        )
    key = public_application_server_key()
    if not key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Browser notifications are not configured.",
        )
    return {"public_key": key}


@router.post("/subscribe")
async def subscribe_browser(
    body: PushSubscribeRequest,
    request: Request,
    current_user: dict = Depends(require_internal_user),
):
    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated.")
    await enforce_shared_rate_limit(f"webpush-sub:{user_id}", 20, 60)
    if not web_push_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Browser notifications are not configured.",
        )
    try:
        return await upsert_subscription(
            user_id=user_id,
            endpoint=body.endpoint,
            p256dh=body.keys.p256dh,
            auth=body.keys.auth,
            user_agent=request.headers.get("user-agent"),
        )
    except InvalidSubscription:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid push subscription.")
    except WebPushConfigError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Browser notifications are unavailable.",
        )


@router.post("/unsubscribe")
async def unsubscribe_browser(
    body: PushUnsubscribeRequest,
    current_user: dict = Depends(require_internal_user),
):
    user_id = current_user.get("id") or ""
    removed = await remove_subscription(user_id, body.endpoint)
    return {"removed": removed}


@router.post("/test")
async def test_push(current_user: dict = Depends(require_internal_user)):
    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated.")
    if not web_push_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Browser notifications are not configured on server.",
        )
    sent = await send_web_push(
        user_ids=[user_id],
        title="Reamarc Web Push Test 🚀",
        body="Desktop notifications are working properly on this browser!",
        kind="test",
        data={"type": "test", "path": "/"},
    )
    if sent == 0:
        return {
            "sent": 0,
            "message": "No active web push subscriptions found for your account. Please enable notifications in this browser.",
        }
    return {
        "sent": sent,
        "message": f"Test notification sent to {sent} active browser(s)!",
    }
