from pydantic_settings import BaseSettings, SettingsConfigDict
from motor.motor_asyncio import AsyncIOMotorClient
import logging
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # MongoDB
    mongo_url: str = "mongodb://localhost:27017"
    db_name: str = "loan_tracking_db"

    # App
    environment: str = "development"

    # JWT
    jwt_secret_key: str = "change-this-to-a-64-char-random-secret-before-production-deploy"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 10080

    # Twilio
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_verify_service_sid: str = ""

    # Cloudinary
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    # HuggingFace
    huggingface_api_key: str = ""


# Singleton settings instance
settings = Settings()


class Database:
    client: AsyncIOMotorClient = None
    db = None

    def connect(self):
        self.client = AsyncIOMotorClient(settings.mongo_url)
        self.db = self.client[settings.db_name]
        logger.info(f"Connected to MongoDB: {settings.db_name}")

    def close(self):
        if self.client:
            self.client.close()


db_instance = Database()


def get_db():
    return db_instance.db
