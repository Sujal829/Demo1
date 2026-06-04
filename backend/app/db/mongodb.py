from pymongo import MongoClient
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

class Database:
    client: MongoClient = None
    
db = Database()

async def connect_to_mongo():
    logger.info("Connecting to MongoDB (pymongo)...")
    db.client = MongoClient(settings.MONGODB_URL)
    logger.info("Connected to MongoDB (pymongo)!")

async def close_mongo_connection():
    logger.info("Closing MongoDB connection (pymongo)...")
    if db.client:
        db.client.close()
    logger.info("MongoDB connection closed (pymongo)!")

async def get_database():
    return db.client[settings.DATABASE_NAME]
