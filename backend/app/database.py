import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings
from app.core.index_migration import ensure_all_company_unique_indexes
from app.core.performance import MongoCommandCounter
import logging

logger = logging.getLogger(__name__)

class Database:
    client: AsyncIOMotorClient = None
    db = None

db_instance = Database()

async def _create_indexes_background():
    """Builds MongoDB indexes asynchronously without blocking fast server startup."""
    try:
        if db_instance.db is None:
            return
        # Unique index on users email and user id (global: one login across companies)
        try:
            await db_instance.db.users.create_index("email", unique=True, name="uniq_user_email")
        except Exception as e:
            logger.warning(f"Could not create unique user email index: {e}")

        try:
            # 1. Backfill any user records missing string 'id' using str(_id)
            cursor = db_instance.db.users.find(
                {"$or": [{"id": None}, {"id": ""}, {"id": {"$exists": False}}]},
                {"_id": 1}
            )
            async for doc in cursor:
                if "_id" in doc:
                    await db_instance.db.users.update_one(
                        {"_id": doc["_id"]},
                        {"$set": {"id": str(doc["_id"])}}
                    )

            # 2. Check for duplicate IDs to avoid silent aborts
            dup_pipeline = [
                {"$match": {"id": {"$exists": True, "$ne": None}}},
                {"$group": {"_id": "$id", "count": {"$sum": 1}}},
                {"$match": {"count": {"$gt": 1}}}
            ]
            duplicates = await db_instance.db.users.aggregate(dup_pipeline).to_list(10)
            if duplicates:
                logger.error(
                    f"Duplicate user IDs found in database: {[d['_id'] for d in duplicates]}. "
                    "Skipping uniq_user_id index until duplicates are resolved."
                )
            else:
                await db_instance.db.users.create_index(
                    "id",
                    unique=True,
                    name="uniq_user_id",
                    partialFilterExpression={"id": {"$type": "string", "$gt": ""}}
                )
        except Exception as e:
            logger.warning(f"Could not create unique user id index: {e}")

        # Compound indexes for fast multi-tenant queries
        await db_instance.db.posts.create_index([("user_id", 1), ("status", 1)])
        await db_instance.db.posts.create_index([("workspaceId", 1), ("status", 1)])
        await db_instance.db.campaigns.create_index([("user_id", 1), ("workspaceId", 1)])
        await db_instance.db.knowledge_sources.create_index([("user_id", 1), ("workspaceId", 1)])
        await db_instance.db.knowledge_chunks.create_index([("workspaceId", 1), ("user_id", 1)])
        await db_instance.db.knowledge_chunks.create_index([("source_id", 1)])
        await db_instance.db.workspaces.create_index([("user_id", 1)])
        await db_instance.db.workspace_audit.create_index(
            [("workspace_id", 1), ("at", 1)],
            name="idx_workspace_audit_ws_at",
        )

        # Performance Marketing Module indexes
        await db_instance.db.marketing_campaigns.create_index([("workspace_id", 1)])
        await db_instance.db.marketing_campaigns.create_index([("workspace_id", 1), ("status", 1)])
        await db_instance.db.marketing_campaigns.create_index([("campaign_name", 1)])
        await db_instance.db.daily_campaign_metrics.create_index([("campaign_id", 1), ("date", -1)])
        await db_instance.db.daily_campaign_metrics.create_index([("date", 1)])

        # Daily Log Module indexes
        await db_instance.db.daily_log_entries.create_index([("workspace_id", 1), ("date", -1)])
        await db_instance.db.daily_log_entries.create_index([("workspace_id", 1), ("user_id", 1), ("date", -1)])
        await db_instance.db.daily_log_entries.create_index([("workspace_id", 1), ("month_sheet", 1)])
        await db_instance.db.daily_log_entries.create_index([("workspace_id", 1), ("resource_name", 1), ("date", -1)])
        await db_instance.db.daily_log_entries.create_index([("user_id", 1), ("date", -1)], name="idx_dailylog_user_date")
        await db_instance.db.daily_log_entries.create_index([("department", 1), ("date", -1)], name="idx_dailylog_dept_date")
        await db_instance.db.daily_log_entries.create_index([("date", -1)], name="idx_dailylog_date_desc")
        await db_instance.db.daily_log_day_scores.create_index([("date", -1), ("status", 1)])
        await db_instance.db.daily_log_day_scores.create_index([("department", 1), ("date", -1)])

        # Password Reset indexes (with TTL expiration support)
        await db_instance.db.password_resets.create_index([("email", 1), ("created_at", -1)])
        await db_instance.db.password_resets.create_index([("expires_at", 1)], expireAfterSeconds=0)

        # Attendance & Leave Module high-performance indexes
        await db_instance.db.attendance_records.create_index([("date", -1)], name="idx_att_date_desc")
        await db_instance.db.attendance_records.create_index([("date", 1), ("status", 1)], name="idx_att_date_status")
        await db_instance.db.company_calendar.create_index([("date", 1)], name="idx_company_calendar_date")
        await db_instance.db.leave_requests.create_index([("created_at", -1)], name="idx_leave_created_at")
        await db_instance.db.leave_requests.create_index([("status", 1), ("created_at", -1)], name="idx_leave_status_created")
        await db_instance.db.leave_requests.create_index([("user_id", 1), ("created_at", -1)], name="idx_leave_user_created")
        await db_instance.db.leave_requests.create_index([("department", 1), ("created_at", -1)], name="idx_leave_dept_created")
        await db_instance.db.leave_requests.create_index([("user_id", 1), ("status", 1)], name="idx_leave_user_status")
        await db_instance.db.leave_requests.create_index([("status", 1)], name="idx_leave_status")
        await db_instance.db.leave_requests.create_index([("start_date", 1), ("end_date", 1)], name="idx_leave_dates")
        await db_instance.db.shifts.create_index([("is_active", 1)], name="idx_shift_active")

        # CRM lead assignment (web module)
        try:
            await db_instance.db.crm_leads.create_index([("phone_e164", 1)], name="idx_crm_phone_e164")
            # Sparse unique indexes still index explicit nulls — strip nulls and use a partial
            # filter so only real external_id strings are unique (manual leads omit the field).
            try:
                await db_instance.db.crm_leads.update_many(
                    {"$or": [{"external_id": None}, {"external_id": ""}]},
                    {"$unset": {"external_id": ""}},
                )
            except Exception as scrub_err:
                logger.warning(f"Could not scrub null CRM external_id values: {scrub_err}")
            await db_instance.db.crm_leads.create_index([("assigned_to", 1), ("contacted", 1)], name="idx_crm_assignee_contacted")
            await db_instance.db.crm_leads.create_index([("stage", 1)], name="idx_crm_stage")
            await db_instance.db.crm_leads.create_index([("stage", 1), ("updated_at", -1)], name="idx_crm_stage_updated")
            await db_instance.db.crm_leads.create_index([("outcome", 1)], name="idx_crm_outcome")
            await db_instance.db.crm_leads.create_index([("created_at", -1)], name="idx_crm_created")
            await db_instance.db.crm_leads.create_index([("next_follow_up_at", 1)], name="idx_crm_followup")
            await db_instance.db.crm_activities.create_index([("lead_id", 1), ("created_at", -1)], name="idx_crm_act_lead")
            await db_instance.db.crm_assignment_rules.create_index([("enabled", 1), ("priority", 1)], name="idx_crm_rule_priority")
            await db_instance.db.crm_leads.create_index(
                [("outcome", 1), ("contacted", 1), ("whatsapp_opened_at", 1)],
                name="idx_crm_sla",
            )
            await db_instance.db.crm_templates.create_index([("is_default", 1)], name="idx_crm_tpl_default")
            await db_instance.db.crm_leads.create_index(
                [("next_follow_up_at", 1), ("outcome", 1)],
                name="idx_crm_followup_due",
            )
            await db_instance.db.crm_leads.create_index([("email", 1)], name="idx_crm_email")
            await db_instance.db.crm_ingest_sources.create_index(
                [("token_hash", 1)], unique=True, name="idx_crm_ingest_token"
            )
            await db_instance.db.crm_ingest_sources.create_index(
                [("enabled", 1)], name="idx_crm_ingest_enabled"
            )
            await db_instance.db.crm_deals.create_index([("lead_id", 1), ("created_at", -1)], name="idx_crm_deal_lead")
            await db_instance.db.crm_deals.create_index([("status", 1)], name="idx_crm_deal_status")
            await db_instance.db.crm_deals.create_index([("stage", 1), ("status", 1)], name="idx_crm_deal_stage_status")
            await db_instance.db.crm_deals.create_index([("updated_at", -1)], name="idx_crm_deal_updated")
        except Exception as e:
            logger.warning(f"Could not create CRM indexes: {e}")

        try:
            await db_instance.db.mobile_devices.create_index(
                [("device_uuid", 1), ("is_active", 1)],
                name="idx_mobile_device_uuid",
            )
            await db_instance.db.mobile_devices.create_index(
                [("user_id", 1), ("is_active", 1)],
                name="idx_mobile_device_user",
            )
            await db_instance.db.mobile_push_receipts.create_index(
                [("user_id", 1), ("date", 1), ("kind", 1)],
                name="idx_push_receipt_lookup",
            )
            await db_instance.db.mobile_notifications.create_index(
                [("user_id", 1), ("created_at", -1)],
                name="idx_mobile_notif_user",
            )
            await db_instance.db.notifications.create_index(
                [("user_id", 1), ("created_at", -1)],
                name="idx_notifications_user_created",
            )
        except Exception as e:
            logger.warning(f"Could not create mobile device indexes: {e}")

        # Website Project Pipeline indexes
        try:
            await db_instance.db.website_projects.create_index([("workspace_id", 1)], name="idx_website_proj_ws")
            await db_instance.db.website_projects.create_index([("stage", 1)], name="idx_website_proj_stage")
            await db_instance.db.website_projects.create_index([("health", 1)], name="idx_website_proj_health")
            await db_instance.db.website_projects.create_index([("manager_id", 1)], name="idx_website_proj_manager")
            await db_instance.db.website_projects.create_index([("target_launch_date", 1)], name="idx_website_proj_launch")

            await db_instance.db.website_project_tasks.create_index([("project_id", 1), ("stage", 1)], name="idx_website_task_proj_stage")
            await db_instance.db.website_project_tasks.create_index([("assignee_id", 1)], name="idx_website_task_assignee")
            await db_instance.db.website_project_tasks.create_index([("status", 1)], name="idx_website_task_status")
            await db_instance.db.website_project_tasks.create_index([("due_date", 1)], name="idx_website_task_due")

            await db_instance.db.website_project_files.create_index([("project_id", 1), ("folder", 1)], name="idx_website_file_proj_folder")
            await db_instance.db.website_project_activities.create_index([("project_id", 1), ("created_at", -1)], name="idx_website_act_proj_time")
        except Exception as e:
            logger.warning(f"Could not create Website Project Pipeline indexes: {e}")

        # Multi-Tenant compound indexes (with company_id first) alongside existing indexes
        try:
            # Global collections indexes
            await db_instance.db.companies.create_index("id", unique=True, name="uniq_company_id")
            await db_instance.db.companies.create_index("slug", unique=True, name="uniq_company_slug")
            await db_instance.db.company_memberships.create_index(
                [("user_id", 1), ("company_id", 1)], unique=True, name="uniq_user_company_membership"
            )
            await db_instance.db.company_memberships.create_index(
                [("company_id", 1), ("status", 1)], name="idx_company_memberships_company_status"
            )
            await db_instance.db.company_memberships.create_index(
                [("user_id", 1), ("status", 1)], name="idx_company_memberships_user_status"
            )
            await db_instance.db.company_integrations.create_index(
                [("company_id", 1), ("integration_type", 1)], unique=True, name="uniq_company_integration"
            )
            await db_instance.db.owner_sessions.create_index("token_hash", unique=True, name="uniq_owner_session_token")
            await db_instance.db.owner_audit.create_index([("created_at", -1)], name="idx_owner_audit_created")
            await db_instance.db.owner_audit.create_index("hash", unique=True, name="uniq_owner_audit_hash")
            await db_instance.db.security_events.create_index([("timestamp", -1)], name="idx_security_events_time")

            await db_instance.db.crm_scheduler_settings.create_index(
                [("company_id", 1)], unique=True, name="uniq_company_crm_scheduler"
            )
            await db_instance.db.users.create_index([("company_id", 1), ("id", 1)], name="idx_company_user_id")
            await db_instance.db.attendance_records.create_index(
                [("company_id", 1), ("date", 1)], name="idx_company_att_date"
            )
            await db_instance.db.leave_requests.create_index(
                [("company_id", 1), ("user_id", 1), ("status", 1)], name="idx_company_leave_user"
            )
            await db_instance.db.crm_leads.create_index(
                [("company_id", 1), ("stage", 1), ("created_at", -1)], name="idx_company_crm_leads"
            )
            await db_instance.db.workspaces.create_index(
                [("company_id", 1), ("id", 1)], name="idx_company_workspace"
            )
            await db_instance.db.website_projects.create_index(
                [("company_id", 1), ("status", 1)], name="idx_company_web_projects"
            )
            # Hot path compounds used by dashboard / attendance / daily-log under TenantDB
            await db_instance.db.attendance_records.create_index(
                [("company_id", 1), ("user_id", 1), ("date", 1)], name="idx_company_att_user_date"
            )
            await db_instance.db.attendance_records.create_index(
                [("company_id", 1), ("date", 1), ("status", 1)], name="idx_company_att_date_status"
            )
            await db_instance.db.daily_log_entries.create_index(
                [("company_id", 1), ("user_id", 1), ("date", -1)], name="idx_company_dailylog_user_date"
            )
            await db_instance.db.daily_log_entries.create_index(
                [("company_id", 1), ("date", -1)], name="idx_company_dailylog_date"
            )
            await db_instance.db.daily_log_day_scores.create_index(
                [("company_id", 1), ("user_id", 1), ("date", 1)], name="idx_company_dailylog_scores_user_date"
            )
            await db_instance.db.company_calendar.create_index(
                [("company_id", 1), ("date", 1)], name="idx_company_calendar_company_date"
            )
            await db_instance.db.content_calendar_items.create_index(
                [("company_id", 1), ("stage", 1)], name="idx_company_content_stage"
            )
            await db_instance.db.leave_requests.create_index(
                [("company_id", 1), ("status", 1), ("created_at", -1)], name="idx_company_leave_status_created"
            )
            await db_instance.db.missed_punch_inquiries.create_index(
                [("company_id", 1), ("status", 1), ("created_at", -1)], name="idx_company_punch_status_created"
            )
            await db_instance.db.website_project_tasks.create_index(
                [("company_id", 1), ("assignee_id", 1), ("status", 1), ("due_date", 1)],
                name="idx_company_webtask_assignee_status_due",
            )
            await db_instance.db.website_projects.create_index(
                [("company_id", 1), ("stage", 1), ("status", 1)], name="idx_company_webproject_stage_status"
            )
        except Exception as e:
            logger.warning(f"Could not initialize multi-tenant indexes: {e}")

        await ensure_all_company_unique_indexes(db_instance.db)

        logger.info("MongoDB background index initialization completed.")
    except Exception as e:
        logger.warning(f"Background index creation warning: {e}")

async def connect_to_mongo():
    try:
        db_instance.client = AsyncIOMotorClient(
            settings.MONGODB_URL,
            maxPoolSize=50,
            minPoolSize=5,
            serverSelectionTimeoutMS=5000,
            event_listeners=[MongoCommandCounter()],
        )
        db_name = settings.MONGODB_DB_NAME
        db_instance.db = db_instance.client[db_name]
        logger.info(f"Connected to MongoDB successfully (db: {db_name})")
        # Trigger index creation in the background so server binds to port immediately
        asyncio.create_task(_create_indexes_background())
    except Exception as e:
        logger.warning(f"Could not connect to MongoDB: {e}. Running in degraded mode.")

async def close_mongo_connection():
    if db_instance.client:
        db_instance.client.close()
        logger.info("MongoDB connection closed.")

def get_database():
    if db_instance.db is None:
        return None
    from app.core.tenant import TenantDB
    return TenantDB(db_instance.db)
