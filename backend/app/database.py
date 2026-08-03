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
        db_instance.client = AsyncIOMotorClient(settings.MONGODB_URL)
        db_name = settings.MONGODB_DB_NAME or settings.DATABASE_NAME
        db_instance.db = db_instance.client[db_name]
        logger.info(f"Connected to MongoDB at {settings.MONGODB_URL} (db: {db_name})")
        
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
    except Exception as e:
        logger.warning(f"Could not connect to MongoDB: {e}. Running in degraded mode.")

async def close_mongo_connection():
    if db_instance.client:
        db_instance.client.close()
        logger.info("MongoDB connection closed.")

def get_database():
    if db_instance.db is None and settings.MONGODB_URL:
        try:
            db_instance.client = AsyncIOMotorClient(settings.MONGODB_URL)
            db_name = settings.MONGODB_DB_NAME or settings.DATABASE_NAME
            db_instance.db = db_instance.client[db_name]
        except Exception as e:
            logger.error(f"Failed to auto-connect to MongoDB: {e}")
    return db_instance.db

