from datetime import datetime, timezone
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


# Lazy initialization happens via get_app_client() and get_target_client()
# on the active event loop during lifespan / request processing.


def get_schemas_collection():
    """Dependency provider for schemas collection in app_db."""
    client = app_client or get_app_client()
    try:
        db = app_db if app_db is not None else client.get_default_database()
    except Exception:
        db = client["extraction_app_db"]
    return db["schemas"]


DEFAULT_SCHEMA_TEMPLATES = [
    {
        "name": "Commercial Invoice",
        "description": "Extracts line items, totals, tax IDs, and dates",
        "json_schema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "properties": {
                "invoice_number": {
                    "type": "string",
                    "description": "Invoice reference ID",
                },
                "invoice_date": {
                    "type": "string",
                    "description": "Date of issue (YYYY-MM-DD)",
                },
                "vendor_name": {"type": "string"},
                "total_amount": {"type": "number"},
                "currency": {"type": "string"},
                "line_items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "description": {"type": "string"},
                            "quantity": {"type": "number"},
                            "unit_price": {"type": "number"},
                            "amount": {"type": "number"},
                        },
                        "required": ["description", "amount"],
                    },
                },
            },
            "required": ["invoice_number", "total_amount"],
        },
    },
    {
        "name": "Clinical / Lab Report",
        "description": "Extracts patient info, ordering physician, and lab test results",
        "json_schema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "properties": {
                "patient_name": {
                    "type": "string",
                    "description": "Full name of the patient",
                },
                "patient_id": {
                    "type": "string",
                    "description": "Medical record or patient identifier",
                },
                "specimen_collection_date": {
                    "type": "string",
                    "description": "Date and time of specimen collection",
                },
                "ordering_physician": {
                    "type": "string",
                    "description": "Name of ordering doctor or clinic",
                },
                "test_results": {
                    "type": "array",
                    "description": "List of laboratory test results and diagnostic markers",
                    "items": {
                        "type": "object",
                        "properties": {
                            "test_name": {
                                "type": "string",
                                "description": "Name of the test or panel marker",
                            },
                            "result_value": {
                                "type": "string",
                                "description": "Observed test measurement or finding",
                            },
                            "units": {
                                "type": "string",
                                "description": "Measurement units (e.g. mg/dL, mmol/L)",
                            },
                            "reference_range": {
                                "type": "string",
                                "description": "Normal or expected reference interval",
                            },
                            "flag": {
                                "type": "string",
                                "description": "Abnormal flag indicator (e.g. Normal, High, Low, Critical)",
                            },
                        },
                        "required": ["test_name", "result_value"],
                    },
                },
            },
            "required": ["patient_name", "test_results"],
        },
    },
]


async def seed_default_schemas(col=None) -> None:
    """Seed initial schema templates if schemas collection is empty."""
    try:
        if col is None:
            col = get_schemas_collection()
        count = await col.count_documents({})
        if count == 0:
            now = datetime.now(timezone.utc)
            templates = [
                {
                    **template,
                    "created_at": now,
                    "updated_at": now,
                }
                for template in DEFAULT_SCHEMA_TEMPLATES
            ]
            await col.insert_many(templates)
            logger.info("Successfully seeded default schema templates.")
    except Exception as exc:
        logger.warning(
            "Could not seed default schemas (MongoDB may be offline): %s", exc
        )


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
            await seed_default_schemas()
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
