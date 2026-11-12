import os
from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

os.environ["LITELLM_LOCAL_MODEL_COST_MAP"] = "True"

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_ENV_FILE = str(ROOT_DIR / ".env")


class Settings(BaseSettings):
    APP_MONGODB_URI: str = "mongodb://localhost:27017/extraction_app_db"
    TARGET_MONGODB_URI: str = "mongodb://localhost:27018/company_enterprise_db"
    LLM_API_BASE: str = "https://api.openai.com/v1"
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "openai/gpt-4o"
    BACKEND_PORT: int = 8001
    UPLOAD_DIR: str = "./data/uploads"

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env", DEFAULT_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
