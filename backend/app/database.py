import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings
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
        # Drop legacy non-sparse index if present, then create sparse index
        try:
            await db_instance.db.posts.drop_index("uniq_campaign_target_date")
        except Exception:
            pass
            
        await db_instance.db.posts.create_index(
            [("campaign_id", 1), ("target_date", 1)],
            unique=True,
            sparse=True,
            name="uniq_campaign_target_date"
        )

        # Unique index on users email
        await db_instance.db.users.create_index("email", unique=True, name="uniq_user_email")

        # Compound indexes for fast multi-tenant queries
        await db_instance.db.posts.create_index([("user_id", 1), ("status", 1)])
        await db_instance.db.posts.create_index([("workspaceId", 1), ("status", 1)])
        await db_instance.db.campaigns.create_index([("user_id", 1), ("workspaceId", 1)])
        await db_instance.db.knowledge_sources.create_index([("user_id", 1), ("workspaceId", 1)])
        await db_instance.db.knowledge_chunks.create_index([("workspaceId", 1), ("user_id", 1)])
        await db_instance.db.knowledge_chunks.create_index([("source_id", 1)])
        await db_instance.db.workspaces.create_index([("user_id", 1)])

        # Performance Marketing Module indexes
        await db_instance.db.marketing_campaigns.create_index([("workspace_id", 1)])
        await db_instance.db.marketing_campaigns.create_index([("workspace_id", 1), ("status", 1)])
        await db_instance.db.marketing_campaigns.create_index([("campaign_name", 1)])
        await db_instance.db.daily_campaign_metrics.create_index(
            [("campaign_id", 1), ("date", 1)],
            unique=True,
            name="uniq_campaign_date_metric"
        )
        await db_instance.db.daily_campaign_metrics.create_index([("campaign_id", 1), ("date", -1)])
        await db_instance.db.daily_campaign_metrics.create_index([("date", 1)])
        await db_instance.db.ad_account_credentials.create_index([("workspace_id", 1), ("platform", 1), ("account_id", 1)], unique=True, sparse=True)
        await db_instance.db.sync_jobs.create_index([("job_key", 1)], unique=True)

        # Daily Log Module indexes
        await db_instance.db.daily_log_entries.create_index([("workspace_id", 1), ("date", -1)])
        await db_instance.db.daily_log_entries.create_index([("workspace_id", 1), ("user_id", 1), ("date", -1)])
        await db_instance.db.daily_log_entries.create_index([("workspace_id", 1), ("month_sheet", 1)])
        await db_instance.db.daily_log_entries.create_index([("workspace_id", 1), ("resource_name", 1), ("date", -1)])
        await db_instance.db.daily_log_entries.create_index([("user_id", 1), ("date", -1)], name="idx_dailylog_user_date")
        await db_instance.db.daily_log_entries.create_index([("department", 1), ("date", -1)], name="idx_dailylog_dept_date")
        await db_instance.db.daily_log_entries.create_index([("date", -1)], name="idx_dailylog_date_desc")
        await db_instance.db.daily_log_entries.create_index([("id", 1), ("workspace_id", 1)], unique=True)
        await db_instance.db.daily_log_columns.create_index([("workspace_id", 1)], unique=True)
        try:
            existing = await db_instance.db.daily_log_day_scores.index_information()
            has_user_date = any(
                list(info.get("key") or []) == [("user_id", 1), ("date", 1)]
                for info in existing.values()
            )
            if not has_user_date:
                await db_instance.db.daily_log_day_scores.create_index(
                    [("user_id", 1), ("date", 1)],
                    unique=True,
                )
        except Exception as e:
            logger.warning(f"Could not create unique daily log day score index: {e}")
        await db_instance.db.daily_log_day_scores.create_index([("date", -1), ("status", 1)])
        await db_instance.db.daily_log_day_scores.create_index([("department", 1), ("date", -1)])

        # Password Reset indexes (with TTL expiration support)
        await db_instance.db.password_resets.create_index([("email", 1), ("created_at", -1)])
        await db_instance.db.password_resets.create_index([("expires_at", 1)], expireAfterSeconds=0)

        # Attendance & Leave Module high-performance indexes
        for coll_name, index_name in (
            ("attendance_records", "idx_att_user_date"),
            ("shifts", "idx_shift_id"),
            ("user_shift_assignments", "idx_user_shift"),
        ):
            try:
                await db_instance.db[coll_name].drop_index(index_name)
            except Exception:
                pass

        try:
            await db_instance.db.attendance_records.create_index(
                [("user_id", 1), ("date", 1)],
                unique=True,
                name="idx_att_user_date",
            )
        except Exception as e:
            logger.warning(f"Could not create unique attendance user/date index: {e}")
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
        try:
            await db_instance.db.leave_balances.create_index(
                [("user_id", 1), ("year", 1)],
                unique=True,
                name="idx_leave_balance_user_year",
            )
        except Exception as e:
            logger.warning(f"Could not create unique leave balance index: {e}")
        try:
            await db_instance.db.user_shift_assignments.create_index(
                [("user_id", 1)],
                unique=True,
                name="idx_user_shift",
            )
        except Exception as e:
            logger.warning(f"Could not create unique user shift assignment index: {e}")
        try:
            await db_instance.db.shifts.create_index([("id", 1)], unique=True, name="idx_shift_id")
        except Exception as e:
            logger.warning(f"Could not create unique shift id index: {e}")
        await db_instance.db.shifts.create_index([("is_active", 1)], name="idx_shift_active")

        # CRM lead assignment (web module)
        try:
            await db_instance.db.crm_leads.create_index([("id", 1)], unique=True, name="idx_crm_lead_id")
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
            try:
                await db_instance.db.crm_leads.drop_index("idx_crm_external_id")
            except Exception:
                pass
            await db_instance.db.crm_leads.create_index(
                [("external_id", 1)],
                unique=True,
                name="idx_crm_external_id",
                partialFilterExpression={
                    "external_id": {"$exists": True, "$type": "string", "$gt": ""},
                },
            )
            await db_instance.db.crm_leads.create_index([("assigned_to", 1), ("contacted", 1)], name="idx_crm_assignee_contacted")
            await db_instance.db.crm_leads.create_index([("stage", 1)], name="idx_crm_stage")
            await db_instance.db.crm_leads.create_index([("outcome", 1)], name="idx_crm_outcome")
            await db_instance.db.crm_leads.create_index([("created_at", -1)], name="idx_crm_created")
            await db_instance.db.crm_leads.create_index([("next_follow_up_at", 1)], name="idx_crm_followup")
            await db_instance.db.crm_activities.create_index([("lead_id", 1), ("created_at", -1)], name="idx_crm_act_lead")
            await db_instance.db.crm_pipeline.create_index([("id", 1)], unique=True, name="idx_crm_pipeline_id")
            await db_instance.db.crm_assignment_rules.create_index([("id", 1)], unique=True, name="idx_crm_rule_id")
            await db_instance.db.crm_assignment_rules.create_index([("enabled", 1), ("priority", 1)], name="idx_crm_rule_priority")
            await db_instance.db.crm_leads.create_index(
                [("outcome", 1), ("contacted", 1), ("whatsapp_opened_at", 1)],
                name="idx_crm_sla",
            )
            await db_instance.db.crm_templates.create_index([("id", 1)], unique=True, name="idx_crm_tpl_id")
            await db_instance.db.crm_templates.create_index([("is_default", 1)], name="idx_crm_tpl_default")
            await db_instance.db.crm_leads.create_index(
                [("next_follow_up_at", 1), ("outcome", 1)],
                name="idx_crm_followup_due",
            )
            await db_instance.db.crm_leads.create_index([("email", 1)], name="idx_crm_email")
            await db_instance.db.crm_ingest_sources.create_index(
                [("id", 1)], unique=True, name="idx_crm_ingest_id"
            )
            await db_instance.db.crm_ingest_sources.create_index(
                [("token_hash", 1)], unique=True, name="idx_crm_ingest_token"
            )
            await db_instance.db.crm_ingest_sources.create_index(
                [("enabled", 1)], name="idx_crm_ingest_enabled"
            )
            await db_instance.db.crm_deals.create_index([("id", 1)], unique=True, name="idx_crm_deal_id")
            await db_instance.db.crm_deals.create_index([("lead_id", 1), ("created_at", -1)], name="idx_crm_deal_lead")
            await db_instance.db.crm_deals.create_index([("status", 1)], name="idx_crm_deal_status")
            await db_instance.db.crm_deals.create_index([("stage", 1), ("status", 1)], name="idx_crm_deal_stage_status")
            await db_instance.db.crm_deals.create_index([("updated_at", -1)], name="idx_crm_deal_updated")
            await db_instance.db.crm_scheduler_slots.create_index(
                [("date", 1), ("slot_time", 1)],
                unique=True,
                name="uniq_crm_scheduler_slot",
            )
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
                unique=True,
                name="idx_push_receipt_unique",
            )
            await db_instance.db.mobile_notifications.create_index(
                [("user_id", 1), ("created_at", -1)],
                name="idx_mobile_notif_user",
            )
        except Exception as e:
            logger.warning(f"Could not create mobile device indexes: {e}")

        # Legacy role cleanup only. Never rewrite live client accounts.
        try:
            await db_instance.db.users.update_many(
                {"role": {"$in": ["editor", "viewer", "member"]}},
                {"$set": {"role": "team_member"}}
            )
        except Exception:
            pass

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
    return db_instance.db
