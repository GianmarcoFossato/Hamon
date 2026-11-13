from contextlib import asynccontextmanager
from datetime import datetime, timezone
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import (
    close_databases,
    get_jobs_collection,
    init_databases,
    ping_databases,
)
from app.routers import documents, extract, harmonize, schemas

logger = logging.getLogger(__name__)
settings = get_settings()


async def startup_sweeper():
    """Startup sweeper transitioning interrupted mid-flight jobs from prior crashes to 'failed' (DEC-2.2, E18)."""
    try:
        col = get_jobs_collection()
        res = await col.update_many(
            {"status": {"$in": ["pending", "waiting_for_render", "extracting", "merging", "harmonizing"]}},
            {
                "$set": {
                    "status": "failed",
                    "commit_in_progress": False,
                    "error_message": "Job aborted: Server process restarted while execution was in flight.",
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
        if res.modified_count > 0:
            logger.info("Startup sweeper marked %d abandoned jobs as failed.", res.modified_count)
    except Exception as exc:
        logger.warning("Startup sweeper could not complete (DB may be offline): %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Non-blocking lifespan connection handling
    db_status = await init_databases()
    if db_status.get("app_db"):
        await startup_sweeper()
    yield
    await close_databases()


app = FastAPI(
    title="Hamon API",
    version="0.1.0",
    description="Data Harmonization and Schema Extraction Backend",
    lifespan=lifespan,
)

# CORS middleware allowing frontend local development ports
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3100",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3100",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include application routers
app.include_router(schemas.router)
app.include_router(documents.router)
app.include_router(extract.router)
app.include_router(harmonize.router)


@app.get("/api/health")
async def health_check():
    db_status = await ping_databases()
    return {
        "status": "ok",
        "databases": {
            "app_db": bool(db_status.get("app_db", False)),
            "target_db": bool(db_status.get("target_db", False)),
        },
    }


@app.get("/")
async def root():
    return {
        "name": "Hamon API",
        "version": "0.1.0",
        "status": "running",
        "health": "/api/health",
    }
