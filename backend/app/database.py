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

    except Exception as e:
        logger.warning(f"Could not connect to MongoDB: {e}. Running in degraded mode.")

async def close_mongo_connection():
    if db_instance.client:
        db_instance.client.close()
        logger.info("MongoDB connection closed.")

def get_database():
    return db_instance.db
