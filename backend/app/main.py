from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import close_databases, init_databases, ping_databases

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Non-blocking lifespan connection handling
    await init_databases()
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
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
