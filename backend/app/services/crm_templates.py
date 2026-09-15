"""CRM WhatsApp / outreach message templates."""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status

from app.database import get_database
from app.services.crm_access import can_assign_leads

_PLACEHOLDER = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")

DEFAULT_TEMPLATES = [
    {
        "name": "Intro",
        "body": (
            "Hi {{first_name}}, this is Reamarc. "
            "Thanks for your interest{{service_clause}}. "
            "When would be a good time for a quick strategy call?"
        ),
        "is_default": True,
    },
    {
        "name": "Follow-up",
        "body": (
            "Hi {{first_name}}, just following up on my earlier message. "
            "Happy to walk you through how we can help{{company_clause}}. "
            "Are you free this week?"
        ),
        "is_default": False,
    },
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _db():
    db = get_database()
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database unavailable.")
    return db


def serialize_template(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": doc.get("id"),
        "name": doc.get("name") or "Template",
        "body": doc.get("body") or "",
        "is_default": bool(doc.get("is_default")),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


def _first_name(name: Optional[str]) -> str:
    if not name:
        return "there"
    return str(name).strip().split()[0] or "there"


def render_template(body: str, lead: Dict[str, Any]) -> str:
    """Replace {{name}}, {{first_name}}, {{company}}, etc. Unknown keys → empty string."""
    service = (lead.get("service") or "").strip()
    company = (lead.get("company") or "").strip()
    values = {
        "name": (lead.get("name") or "").strip(),
        "first_name": _first_name(lead.get("name")),
        "company": company,
        "city": (lead.get("city") or "").strip(),
        "service": service,
        "source": (lead.get("source") or "").strip(),
        "campaign": (lead.get("campaign") or "").strip(),
        "service_clause": f" in {service}" if service else "",
        "company_clause": f" for {company}" if company else "",
    }

    def repl(match: re.Match) -> str:
        key = match.group(1).lower()
        return str(values.get(key, ""))

    return _PLACEHOLDER.sub(repl, body or "").strip()


async def ensure_default_templates() -> None:
    db = _db()
    count = await db.crm_templates.count_documents({})
    if count > 0:
        return
    now = _now()
    docs = []
    for t in DEFAULT_TEMPLATES:
        docs.append(
            {
                "id": f"tpl_{uuid.uuid4().hex[:10]}",
                "name": t["name"],
                "body": t["body"],
                "is_default": bool(t.get("is_default")),
                "created_at": now,
                "updated_at": now,
            }
        )
    if docs:
        await db.crm_templates.insert_many(docs)


async def list_templates() -> List[Dict[str, Any]]:
    await ensure_default_templates()
    docs = await _db().crm_templates.find({}, {"_id": 0}).sort([("is_default", -1), ("name", 1)]).to_list(100)
    return [serialize_template(d) for d in docs]


async def get_template(template_id: str) -> Dict[str, Any]:
    doc = await _db().crm_templates.find_one({"id": template_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found.")
    return serialize_template(doc)


async def create_template(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    if not can_assign_leads(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot manage templates.")
    now = _now()
    make_default = bool(payload.get("is_default"))
    doc = {
        "id": f"tpl_{uuid.uuid4().hex[:10]}",
        "name": str(payload.get("name") or "Template").strip()[:80],
        "body": str(payload.get("body") or "").strip()[:2000],
        "is_default": make_default,
        "created_by": user.get("id"),
        "created_at": now,
        "updated_at": now,
    }
    if not doc["body"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Template body is required.")
    db = _db()
    if make_default:
        await db.crm_templates.update_many({}, {"$set": {"is_default": False}})
    await db.crm_templates.insert_one(doc)
    return serialize_template(doc)


async def update_template(template_id: str, payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    if not can_assign_leads(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot manage templates.")
    await get_template(template_id)
    fields: Dict[str, Any] = {"updated_at": _now()}
    if "name" in payload and payload["name"] is not None:
        fields["name"] = str(payload["name"]).strip()[:80]
    if "body" in payload and payload["body"] is not None:
        body = str(payload["body"]).strip()[:2000]
        if not body:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Template body is required.")
        fields["body"] = body
    if "is_default" in payload and payload["is_default"] is not None:
        fields["is_default"] = bool(payload["is_default"])
        if fields["is_default"]:
            await _db().crm_templates.update_many(
                {"id": {"$ne": template_id}},
                {"$set": {"is_default": False}},
            )
    await _db().crm_templates.update_one({"id": template_id}, {"$set": fields})
    return await get_template(template_id)


async def delete_template(template_id: str, user: Dict[str, Any]) -> None:
    if not can_assign_leads(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot manage templates.")
    res = await _db().crm_templates.delete_one({"id": template_id})
    if not res.deleted_count:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found.")


async def preview_for_lead(template_id: Optional[str], lead: Dict[str, Any]) -> Dict[str, Any]:
    """Return rendered text + template meta. Uses default template if id omitted."""
    await ensure_default_templates()
    db = _db()
    doc = None
    if template_id:
        doc = await db.crm_templates.find_one({"id": template_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found.")
    else:
        doc = await db.crm_templates.find_one({"is_default": True}, {"_id": 0})
        if not doc:
            docs = await db.crm_templates.find({}, {"_id": 0}).limit(1).to_list(1)
            doc = docs[0] if docs else None
    if not doc:
        return {"template_id": None, "template_name": None, "text": ""}
    text = render_template(doc.get("body") or "", lead)
    return {
        "template_id": doc.get("id"),
        "template_name": doc.get("name"),
        "text": text,
    }
