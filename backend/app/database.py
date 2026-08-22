from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings
import logging

logger = logging.getLogger(__name__)

class Database:
    client: AsyncIOMotorClient = None
    db = None

db_instance = Database()

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
        await db_instance.db.daily_log_entries.create_index([("id", 1), ("workspace_id", 1)], unique=True)
        await db_instance.db.daily_log_columns.create_index([("workspace_id", 1)], unique=True)
        try:
            await db_instance.db.daily_log_day_scores.create_index(
                [("user_id", 1), ("date", 1)],
                unique=True,
                name="idx_day_score_user_date",
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
        await db_instance.db.attendance_records.create_index([("date", 1)], name="idx_att_date")
        await db_instance.db.attendance_records.create_index([("date", 1), ("status", 1)], name="idx_att_date_status")
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

        # Legacy role cleanup only. Never rewrite live client accounts.
        try:
            await db_instance.db.users.update_many(
                {"role": {"$in": ["editor", "viewer", "member"]}},
                {"$set": {"role": "team_member"}}
            )
        except Exception:
            pass

    except Exception as e:
        logger.warning(f"Could not connect to MongoDB: {e}. Running in degraded mode.")

async def close_mongo_connection():
    if db_instance.client:
        db_instance.client.close()
        logger.info("MongoDB connection closed.")

def get_database():
    return db_instance.db
