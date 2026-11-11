import logging
from typing import Optional
from pymongo import AsyncMongoClient
from pymongo.errors import PyMongoError

from app.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

app_client: Optional[AsyncMongoClient] = None
target_client: Optional[AsyncMongoClient] = None
app_db = None
target_db = None


def get_app_client() -> AsyncMongoClient:
    global app_client, app_db
    if app_client is None:
        app_client = AsyncMongoClient(
            settings.APP_MONGODB_URI,
            serverSelectionTimeoutMS=2000,
        )
        try:
            app_db = app_client.get_default_database()
        except Exception:
            app_db = app_client["extraction_app_db"]
    return app_client


def get_target_client() -> AsyncMongoClient:
    global target_client, target_db
    if target_client is None:
        target_client = AsyncMongoClient(
            settings.TARGET_MONGODB_URI,
            serverSelectionTimeoutMS=2000,
        )
        try:
            target_db = target_client.get_default_database()
        except Exception:
            target_db = target_client["company_enterprise_db"]
    return target_client


# Pre-initialize clients
try:
    app_client = get_app_client()
    app_db = app_client.get_default_database()
except Exception as exc:
    logger.warning("Initial app_client setup warning: %s", exc)

try:
    target_client = get_target_client()
    target_db = target_client.get_default_database()
except Exception as exc:
    logger.warning("Initial target_client setup warning: %s", exc)


async def ping_databases() -> dict[str, bool]:
    results = {"app_db": False, "target_db": False}

    client_a = app_client or get_app_client()
    try:
        await client_a.admin.command("ping")
        results["app_db"] = True
    except (PyMongoError, Exception) as exc:
        logger.warning("Database ping failed for app_db: %s", exc)
        results["app_db"] = False

    client_t = target_client or get_target_client()
    try:
        await client_t.admin.command("ping")
        results["target_db"] = True
    except (PyMongoError, Exception) as exc:
        logger.warning("Database ping failed for target_db: %s", exc)
        results["target_db"] = False

    return results


async def init_databases() -> None:
    try:
        status = await ping_databases()
        if status.get("app_db"):
            logger.info("Connected to app_db successfully.")
        else:
            logger.warning("app_db is currently unreachable (server starting cleanly).")

        if status.get("target_db"):
            logger.info("Connected to target_db successfully.")
        else:
            logger.warning("target_db is currently unreachable (server starting cleanly).")
    except Exception as exc:
        logger.warning("Non-blocking DB connection check warning during startup: %s", exc)


async def close_databases() -> None:
    global app_client, target_client, app_db, target_db
    if app_client is not None:
        try:
            await app_client.close()
        except Exception as exc:
            logger.warning("Error closing app_client: %s", exc)
        finally:
            app_client = None
            app_db = None
    if target_client is not None:
        try:
            await target_client.close()
        except Exception as exc:
            logger.warning("Error closing target_client: %s", exc)
        finally:
            target_client = None
            target_db = None
