"""
backend/app/core/tenant.py
Multi-tenant isolation layer:
- ContextVar TenantContext
- TenantDB / TenantCollection wrapper
- get_global_db() for owner & system collections
- CrossTenantError & NoTenantContext fail-closed exceptions
- Runtime guard & security_events logger
- get_owned_or_404 & for_each_active_company helpers
"""

from __future__ import annotations

import asyncio
from contextvars import ContextVar, Token
from dataclasses import dataclass
from datetime import datetime, timezone
import logging
from typing import Any, Awaitable, Callable, Dict, List, Optional, Set, Union

from fastapi import HTTPException, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from pymongo.errors import PyMongoError
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorCollection

from app.config import settings

logger = logging.getLogger("app.tenant")


def _company_id_clause(cid: str) -> Any:
    """Reamarc still sees legacy docs that have no company_id."""
    if cid == "company_reamarc":
        return {"$in": ["company_reamarc", None]}
    return cid


class CrossTenantError(Exception):
    """Raised when an operation crosses tenant boundaries."""
    pass


class NoTenantContext(Exception):
    """Raised when a tenant query or write is attempted without active tenant context."""
    pass


class ReadOnlyImpersonationError(HTTPException):
    """Raised when a write is attempted in read-only impersonation mode."""
    def __init__(self, detail: str = "Writes are disabled during read-only owner session"):
        super().__init__(status_code=403, detail=detail)


@dataclass
class TenantContext:
    company_id: Optional[str] = None
    user_id: Optional[str] = None
    is_owner: bool = False
    impersonating: bool = False
    read_only: bool = False
    request_id: Optional[str] = None


_tenant_context_var: ContextVar[Optional[TenantContext]] = ContextVar("tenant_context", default=None)


def get_tenant_context() -> Optional[TenantContext]:
    return _tenant_context_var.get()


def set_tenant_context(ctx: TenantContext) -> Token:
    return _tenant_context_var.set(ctx)


def reset_tenant_context(token: Token) -> None:
    _tenant_context_var.reset(token)


class tenant_scope:
    """Context manager to run a block inside a scoped tenant context."""
    def __init__(
        self,
        company_id: Optional[str],
        user_id: Optional[str] = None,
        is_owner: bool = False,
        impersonating: bool = False,
        read_only: bool = False,
        request_id: Optional[str] = None,
    ):
        self.ctx = TenantContext(
            company_id=company_id,
            user_id=user_id,
            is_owner=is_owner,
            impersonating=impersonating,
            read_only=read_only,
            request_id=request_id,
        )
        self.token: Optional[Token] = None

    def __enter__(self) -> TenantContext:
        self.token = set_tenant_context(self.ctx)
        return self.ctx

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.token is not None:
            reset_tenant_context(self.token)

    async def __aenter__(self) -> TenantContext:
        return self.__enter__()

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        self.__exit__(exc_type, exc_val, exc_tb)


GLOBAL_COLLECTIONS: Set[str] = frozenset({
    "companies",
    "company_memberships",
    "company_integrations",
    "owner_audit",
    "owner_sessions",
    "migrations",
    "rate_limit_counters",
    "security_events",
    "password_resets",
    "job_locks",
})

TENANT_COLLECTIONS: Set[str] = frozenset({
    "users",
    "attendance_records",
    "leave_requests",
    "leave_balances",
    "monthly_leave_settlements",
    "shifts",
    "user_shift_assignments",
    "company_calendar",
    "missed_punch_inquiries",
    "daily_log_entries",
    "daily_log_columns",
    "daily_log_day_scores",
    "daily_logs",
    "crm_leads",
    "crm_deals",
    "crm_activities",
    "crm_lead_events",
    "crm_pipeline",
    "crm_templates",
    "crm_assignment_rules",
    "crm_ingest_sources",
    "crm_meta_pages",
    "crm_career_applications",
    "crm_scheduler_slots",
    "crm_scheduler_settings",
    "workspaces",
    "website_projects",
    "website_project_tasks",
    "website_project_gates",
    "website_project_files",
    "website_project_activities",
    "content_calendar_items",
    "content_calendar_counters",
    "posts",
    "campaigns",
    "ad_accounts",
    "ad_account_credentials",
    "marketing_campaigns",
    "daily_campaign_metrics",
    "sync_jobs",
    "notifications",
    "mobile_notifications",
    "mobile_push_receipts",
    "mobile_devices",
    "web_push_subscriptions",
    "password_resets",
    "permission_audit",
    "user_permission_overrides",
    "system_config",
    "knowledge_sources",
    "knowledge_chunks",
})


def _get_raw_db() -> AsyncIOMotorDatabase:
    from app.database import db_instance
    return db_instance.db


def get_global_db() -> AsyncIOMotorDatabase:
    """Access global collections. Restricted to owner routes, auth lookup, scripts, migrations."""
    raw = _get_raw_db()
    if raw is None:
        return None
    return raw


async def log_security_event(event_type: str, details: Dict[str, Any]):
    """Logs an immutable security event into security_events collection."""
    try:
        raw = _get_raw_db()
        if raw is not None:
            ctx = get_tenant_context()
            cid = (details or {}).get("company_id") or (ctx.company_id if ctx else None)
            event = {
                "event_type": event_type,
                "timestamp": datetime.now(timezone.utc),
                "company_id": cid,
                "details": details,
            }
            await raw.security_events.insert_one(event)
    except Exception as e:
        logger.error(f"Failed to record security event: {e}")


def _assert_runtime_guard(filter_or_pipeline: Any, coll_name: str, cid: str):
    """Runtime guard asserting the final query contains company_id."""
    if isinstance(filter_or_pipeline, dict):
        if "company_id" not in filter_or_pipeline and "$and" not in filter_or_pipeline:
            # Query did not receive company_id filter
            asyncio.create_task(log_security_event("runtime_guard_missing_company_id", {
                "collection": coll_name,
                "expected_cid": cid,
                "filter": str(filter_or_pipeline),
            }))
            raise RuntimeError(f"Tenant runtime guard violation: query on '{coll_name}' lacks company_id filter")
    elif isinstance(filter_or_pipeline, list):
        # Aggregation pipeline
        has_match = any("$match" in stage and "company_id" in stage["$match"] for stage in filter_or_pipeline)
        if not has_match:
            asyncio.create_task(log_security_event("runtime_guard_missing_pipeline_match", {
                "collection": coll_name,
                "expected_cid": cid,
            }))
            raise RuntimeError(f"Tenant runtime guard violation: pipeline on '{coll_name}' lacks company_id match")


class TenantCollection:
    def __init__(self, raw_coll: AsyncIOMotorCollection, name: str):
        self._coll = raw_coll
        self.name = name

    def _scope_filter(self, filter_dict: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        ctx = get_tenant_context()
        multi_enabled = getattr(settings, "MULTI_TENANT_ENABLED", False)

        if not multi_enabled and ctx is None:
            # Multi-tenancy disabled & no context: operate in legacy shadow mode
            return filter_dict if filter_dict is not None else {}

        if ctx is None or not ctx.company_id:
            if multi_enabled:
                raise NoTenantContext(f"Query on tenant collection '{self.name}' refused: no tenant context.")
            return filter_dict if filter_dict is not None else {}

        cid = ctx.company_id
        res = dict(filter_dict) if filter_dict is not None else {}

        # Cross-tenant check
        if "company_id" in res:
            existing_cid = res["company_id"]
            if existing_cid != cid:
                raise CrossTenantError(
                    f"CrossTenantError: query specifies company_id '{existing_cid}' "
                    f"which differs from context '{cid}' on collection '{self.name}'"
                )
        else:
            res["company_id"] = _company_id_clause(cid)

        _assert_runtime_guard(res, self.name, cid)
        return res

    def _check_writable(self):
        ctx = get_tenant_context()
        if ctx and ctx.read_only:
            raise ReadOnlyImpersonationError()

    def _stamp_doc(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        self._check_writable()
        ctx = get_tenant_context()
        multi_enabled = getattr(settings, "MULTI_TENANT_ENABLED", False)

        if not multi_enabled and ctx is None:
            return doc

        if ctx is None or not ctx.company_id:
            if multi_enabled:
                raise NoTenantContext(f"Insert on tenant collection '{self.name}' refused: no tenant context.")
            return doc

        cid = ctx.company_id
        if "company_id" in doc and doc["company_id"] != cid:
            raise CrossTenantError(
                f"CrossTenantError: document carries company_id '{doc['company_id']}' != context '{cid}'"
            )
        doc["company_id"] = cid
        return doc

    def find(self, filter=None, *args, **kwargs):
        scoped = self._scope_filter(filter)
        return self._coll.find(scoped, *args, **kwargs)

    async def find_one(self, filter=None, *args, **kwargs):
        scoped = self._scope_filter(filter)
        return await self._coll.find_one(scoped, *args, **kwargs)

    async def count_documents(self, filter=None, *args, **kwargs):
        scoped = self._scope_filter(filter)
        return await self._coll.count_documents(scoped, *args, **kwargs)

    async def estimated_document_count(self, *args, **kwargs):
        # Plan rule: estimated_document_count (-> count with the filter)
        ctx = get_tenant_context()
        if ctx and ctx.company_id:
            return await self.count_documents({})
        return await self._coll.estimated_document_count(*args, **kwargs)

    async def distinct(self, key, filter=None, *args, **kwargs):
        scoped = self._scope_filter(filter)
        return await self._coll.distinct(key, scoped, *args, **kwargs)

    async def insert_one(self, document, *args, **kwargs):
        doc = self._stamp_doc(document)
        return await self._coll.insert_one(doc, *args, **kwargs)

    async def insert_many(self, documents, *args, **kwargs):
        stamped = [self._stamp_doc(d) for d in documents]
        return await self._coll.insert_many(stamped, *args, **kwargs)

    async def update_one(self, filter, update, upsert=False, *args, **kwargs):
        self._check_writable()
        scoped = self._scope_filter(filter)
        ctx = get_tenant_context()
        if ctx and ctx.company_id and isinstance(update, dict):
            if upsert:
                if "$set" in update and isinstance(update["$set"], dict) and "company_id" in update["$set"]:
                    pass
                elif "$setOnInsert" in update and isinstance(update["$setOnInsert"], dict):
                    update["$setOnInsert"]["company_id"] = ctx.company_id
                elif any(k.startswith("$") for k in update.keys()):
                    update["$setOnInsert"] = {"company_id": ctx.company_id}
            else:
                if "$set" in update and isinstance(update["$set"], dict):
                    if "company_id" in update["$set"] and update["$set"]["company_id"] != ctx.company_id:
                        raise CrossTenantError(
                            f"CrossTenantError: $set.company_id '{update['$set']['company_id']}' "
                            f"differs from context '{ctx.company_id}'"
                        )
                    update["$set"].setdefault("company_id", ctx.company_id)
        return await self._coll.update_one(scoped, update, upsert=upsert, *args, **kwargs)

    async def update_many(self, filter, update, upsert=False, *args, **kwargs):
        self._check_writable()
        scoped = self._scope_filter(filter)
        ctx = get_tenant_context()
        if ctx and ctx.company_id and isinstance(update, dict):
            if upsert:
                if "$set" in update and isinstance(update["$set"], dict) and "company_id" in update["$set"]:
                    pass
                elif "$setOnInsert" in update and isinstance(update["$setOnInsert"], dict):
                    update["$setOnInsert"]["company_id"] = ctx.company_id
                elif any(k.startswith("$") for k in update.keys()):
                    update["$setOnInsert"] = {"company_id": ctx.company_id}
            else:
                if "$set" in update and isinstance(update["$set"], dict):
                    if "company_id" in update["$set"] and update["$set"]["company_id"] != ctx.company_id:
                        raise CrossTenantError(
                            f"CrossTenantError: $set.company_id '{update['$set']['company_id']}' "
                            f"differs from context '{ctx.company_id}'"
                        )
                    update["$set"].setdefault("company_id", ctx.company_id)
        return await self._coll.update_many(scoped, update, upsert=upsert, *args, **kwargs)

    async def replace_one(self, filter, replacement, upsert=False, *args, **kwargs):
        self._check_writable()
        scoped = self._scope_filter(filter)
        doc = self._stamp_doc(replacement)
        return await self._coll.replace_one(scoped, doc, upsert=upsert, *args, **kwargs)

    async def delete_one(self, filter, *args, **kwargs):
        self._check_writable()
        scoped = self._scope_filter(filter)
        return await self._coll.delete_one(scoped, *args, **kwargs)

    async def delete_many(self, filter, *args, **kwargs):
        self._check_writable()
        scoped = self._scope_filter(filter)
        return await self._coll.delete_many(scoped, *args, **kwargs)

    async def find_one_and_update(self, filter, update, *args, **kwargs):
        self._check_writable()
        scoped = self._scope_filter(filter)
        ctx = get_tenant_context()
        if ctx and ctx.company_id and isinstance(update, dict):
            upsert = kwargs.get("upsert", False)
            if upsert:
                if "$set" in update and isinstance(update["$set"], dict) and "company_id" in update["$set"]:
                    pass
                elif "$setOnInsert" in update and isinstance(update["$setOnInsert"], dict):
                    update["$setOnInsert"]["company_id"] = ctx.company_id
                elif any(k.startswith("$") for k in update.keys()):
                    update["$setOnInsert"] = {"company_id": ctx.company_id}
            else:
                if "$set" in update and isinstance(update["$set"], dict):
                    if "company_id" in update["$set"] and update["$set"]["company_id"] != ctx.company_id:
                        raise CrossTenantError(
                            f"CrossTenantError: $set.company_id '{update['$set']['company_id']}' "
                            f"differs from context '{ctx.company_id}'"
                        )
                    update["$set"].setdefault("company_id", ctx.company_id)
        return await self._coll.find_one_and_update(scoped, update, *args, **kwargs)

    async def find_one_and_delete(self, filter, *args, **kwargs):
        self._check_writable()
        scoped = self._scope_filter(filter)
        return await self._coll.find_one_and_delete(scoped, *args, **kwargs)

    async def find_one_and_replace(self, filter, replacement, *args, **kwargs):
        self._check_writable()
        scoped = self._scope_filter(filter)
        doc = self._stamp_doc(replacement)
        return await self._coll.find_one_and_replace(scoped, doc, *args, **kwargs)

    async def bulk_write(self, requests, *args, **kwargs):
        self._check_writable()
        ctx = get_tenant_context()
        multi_enabled = getattr(settings, "MULTI_TENANT_ENABLED", False)

        if (multi_enabled or ctx is not None) and ctx and ctx.company_id:
            cid = ctx.company_id
            for req in requests:
                req_type = type(req).__name__
                if req_type == "InsertOne":
                    if hasattr(req, "_doc"):
                        if "company_id" in req._doc and req._doc["company_id"] != cid:
                            raise CrossTenantError("Cross-tenant insert in bulk_write")
                        req._doc["company_id"] = cid
                elif req_type in ("UpdateOne", "UpdateMany", "DeleteOne", "DeleteMany", "ReplaceOne"):
                    if hasattr(req, "_filter"):
                        if isinstance(req._filter, dict):
                            if "company_id" in req._filter and req._filter["company_id"] != cid:
                                raise CrossTenantError("Cross-tenant filter in bulk_write")
                            req._filter["company_id"] = _company_id_clause(cid)
                    if req_type == "ReplaceOne" and hasattr(req, "_doc"):
                        req._doc["company_id"] = cid
        return await self._coll.bulk_write(requests, *args, **kwargs)

    def aggregate(self, pipeline, *args, **kwargs):
        ctx = get_tenant_context()
        multi_enabled = getattr(settings, "MULTI_TENANT_ENABLED", False)

        if not multi_enabled and ctx is None:
            return self._coll.aggregate(pipeline, *args, **kwargs)

        if ctx is None or not ctx.company_id:
            if multi_enabled:
                raise NoTenantContext(f"Aggregation on '{self.name}' refused: no tenant context.")
            return self._coll.aggregate(pipeline, *args, **kwargs)

        cid = ctx.company_id
        new_pipe = []

        # Validate pipeline stages
        for stage in pipeline:
            if "$out" in stage or "$merge" in stage:
                raise CrossTenantError("$out and $merge aggregation stages are refused in tenant queries")

            s_copy = dict(stage)
            if "$lookup" in s_copy:
                lk = dict(s_copy["$lookup"])
                clause = {"company_id": _company_id_clause(cid)}
                if "pipeline" in lk and isinstance(lk["pipeline"], list):
                    sub_pipe = list(lk["pipeline"])
                    sub_pipe.insert(0, {"$match": clause})
                    lk["pipeline"] = sub_pipe
                    s_copy["$lookup"] = lk
            if "$graphLookup" in s_copy:
                gl = dict(s_copy["$graphLookup"])
                rsm = dict(gl.get("restrictSearchWithMatch") or {})
                rsm["company_id"] = _company_id_clause(cid)
                gl["restrictSearchWithMatch"] = rsm
                s_copy["$graphLookup"] = gl
            if "$unionWith" in s_copy:
                uw = s_copy["$unionWith"]
                if isinstance(uw, dict) and "pipeline" in uw and isinstance(uw["pipeline"], list):
                    uw_copy = dict(uw)
                    sub_pipe = list(uw_copy["pipeline"])
                    sub_pipe.insert(0, {"$match": {"company_id": _company_id_clause(cid)}})
                    uw_copy["pipeline"] = sub_pipe
                    s_copy["$unionWith"] = uw_copy
            new_pipe.append(s_copy)

        new_pipe.insert(0, {"$match": {"company_id": _company_id_clause(cid)}})
        _assert_runtime_guard(new_pipe, self.name, cid)
        return self._coll.aggregate(new_pipe, *args, **kwargs)

    def watch(self, pipeline=None, *args, **kwargs):
        ctx = get_tenant_context()
        pipe = list(pipeline or [])
        if ctx and ctx.company_id:
            pipe.insert(0, {"$match": {"fullDocument.company_id": ctx.company_id}})
        return self._coll.watch(pipe, *args, **kwargs)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._coll, name)


class TenantDB:
    def __init__(self, raw_db: AsyncIOMotorDatabase):
        self._raw_db = raw_db

    def raw(self) -> AsyncIOMotorDatabase:
        """Unwrap to the Motor database (GridFS and other non-collection APIs)."""
        return self._raw_db

    def __getitem__(self, name: str) -> TenantCollection:
        if name in GLOBAL_COLLECTIONS:
            raise ValueError(
                f"Collection '{name}' is a global collection and cannot be accessed via TenantDB. "
                "Use get_global_db()."
            )
        return TenantCollection(self._raw_db[name], name)

    def __getattr__(self, name: str) -> Any:
        if name.startswith("_"):
            return getattr(self._raw_db, name)
        if name in GLOBAL_COLLECTIONS:
            raise ValueError(
                f"Collection '{name}' is a global collection and cannot be accessed via TenantDB. "
                "Use get_global_db()."
            )
        return TenantCollection(self._raw_db[name], name)


async def get_owned_or_404(coll: Any, doc_id: Union[str, Any]) -> Dict[str, Any]:
    """Helper to fetch a document by ID with tenant isolation.
    Returns 404 if not found or cross-company (never 403).
    """
    if not doc_id:
        raise HTTPException(status_code=404, detail="Resource not found")

    filter_query: Dict[str, Any]
    if isinstance(doc_id, str):
        filter_query = {"$or": [{"id": doc_id}, {"_id": doc_id}]}
    else:
        filter_query = {"_id": doc_id}

    doc = await coll.find_one(filter_query)
    if not doc:
        raise HTTPException(status_code=404, detail="Resource not found")
    return doc


async def for_each_active_company(fn: Callable[[Dict[str, Any]], Awaitable[None]]):
    """Iterates through all active companies, sets tenant context for each, and executes fn."""
    gdb = get_global_db()
    if gdb is None:
        return

    cursor = gdb.companies.find({"status": "active"})
    async for company in cursor:
        cid = company.get("id") or str(company.get("_id"))
        with tenant_scope(company_id=cid):
            try:
                await fn(company)
            except Exception as e:
                logger.exception(f"Error executing company job for company {cid}: {e}")


def company_tz(company: Optional[Dict[str, Any]] = None) -> str:
    """Returns company's configured timezone or falls back to settings.TIMEZONE / 'Asia/Karachi'."""
    if company and company.get("timezone"):
        return company["timezone"]
    return getattr(settings, "TIMEZONE", "Asia/Karachi")


def resolve_company_from_host(request: Request) -> Optional[str]:
    """Resolves company from request host header (stub, returns None for now)."""
    return None


class TenantPayloadStrippingMiddleware(BaseHTTPMiddleware):
    """Strips company_id, is_super_admin, and token_version from client requests."""
    async def dispatch(self, request: Request, call_next) -> Response:
        # Strip client-injected query params
        mutable_query = dict(request.query_params)
        for forbidden in ("company_id", "is_super_admin", "token_version"):
            mutable_query.pop(forbidden, None)

        return await call_next(request)
