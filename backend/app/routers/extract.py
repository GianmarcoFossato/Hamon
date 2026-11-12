import asyncio
from datetime import datetime, timezone
import json
import logging
import time
from typing import Any, AsyncGenerator, Optional
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, status
from sse_starlette.sse import EventSourceResponse

from app.database import get_documents_collection, get_jobs_collection, get_schemas_collection
from app.models.job import (
    ExtractStartRequest,
    ExtractionJob,
    ExtractionJobResponse,
    TokenUsage,
)
from app.services.litellm_service import (
    execute_extraction_pipeline,
    normalize_schema_for_strict_mode,
)
from app.services.pdf_service import ensure_pages_rendered

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/extract", tags=["extract"])

# Strong references for background tasks (DEC-2.2)
_extraction_tasks: set[asyncio.Task] = set()


class JobEventBroker:
    """Pub/Sub broker maintaining isolated queues per client with 10-min TTL (E11)."""
    def __init__(self):
        self._subscribers: dict[str, set[asyncio.Queue]] = {}
        self._latest_snapshot: dict[str, dict[str, Any]] = {}
        self._timestamps: dict[str, float] = {}
        self._lock = asyncio.Lock()

    async def publish(self, job_id: str, event_data: dict[str, Any]):
        async with self._lock:
            self._latest_snapshot[job_id] = event_data
            self._timestamps[job_id] = time.time()
            queues = list(self._subscribers.get(job_id, set()))

        for q in queues:
            await q.put(event_data)

    async def subscribe(self, job_id: str) -> AsyncGenerator[dict[str, Any], None]:
        q: asyncio.Queue = asyncio.Queue()
        async with self._lock:
            if job_id not in self._subscribers:
                self._subscribers[job_id] = set()
            self._subscribers[job_id].add(q)
            initial_snapshot = self._latest_snapshot.get(job_id)

        if initial_snapshot:
            await q.put(initial_snapshot)

        try:
            while True:
                data = await q.get()
                yield data
                if data.get("status") in ("completed", "partial_success", "failed"):
                    break
        finally:
            async with self._lock:
                if job_id in self._subscribers and q in self._subscribers[job_id]:
                    self._subscribers[job_id].remove(q)
                    if not self._subscribers[job_id]:
                        self._subscribers.pop(job_id, None)

    async def cleanup_expired(self, ttl_seconds: float = 600.0):
        now = time.time()
        async with self._lock:
            expired_ids = [
                jid for jid, ts in self._timestamps.items()
                if now - ts > ttl_seconds and jid not in self._subscribers
            ]
            for jid in expired_ids:
                self._latest_snapshot.pop(jid, None)
                self._timestamps.pop(jid, None)


broker = JobEventBroker()


def _parse_page_range(page_range_str: Optional[str], total_pages: int) -> list[int]:
    """Parse range string like '0-2', '0,1,3', or None to list of 0-indexed integers."""
    if not page_range_str or not page_range_str.strip():
        return list(range(total_pages))

    pages: set[int] = set()
    parts = page_range_str.split(",")
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if "-" in p:
            start_s, end_s = p.split("-", 1)
            try:
                start = int(start_s.strip())
                end = int(end_s.strip())
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid page range token '{p}'")
            if start > end:
                raise HTTPException(status_code=400, detail=f"Start page {start} cannot exceed end page {end}")
            for i in range(start, end + 1):
                if 0 <= i < total_pages:
                    pages.add(i)
                else:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Page {i} out of bounds (document has {total_pages} pages)",
                    )
        else:
            try:
                val = int(p)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid page token '{p}'")
            if 0 <= val < total_pages:
                pages.add(val)
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Page {val} out of bounds (document has {total_pages} pages)",
                )

    return sorted(list(pages))


async def _run_extraction_worker(
    job_id: str,
    doc_id: str,
    requested_pages: list[int],
    schema: dict[str, Any],
):
    """Background extraction orchestrator."""
    col_jobs = get_jobs_collection()

    async def _emit_progress(status_val: str, percent: int, msg: str, extra: Optional[dict] = None):
        payload = {
            "job_id": job_id,
            "status": status_val,
            "progress_percent": percent,
            "message": msg,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if extra:
            payload.update(extra)

        await col_jobs.update_one(
            {"_id": job_id},
            {"$set": {
                "status": status_val,
                "progress_percent": percent,
                "updated_at": datetime.now(timezone.utc),
            }}
        )
        await broker.publish(job_id, payload)

    try:
        await _emit_progress("waiting_for_render", 10, "Awaiting document rendering...")

        # Barrier: ensure requested pages are rendered to disk
        image_paths = await ensure_pages_rendered(doc_id, requested_pages)

        await _emit_progress("extracting", 30, f"Executing vision extraction across {len(image_paths)} pages...")

        raw_result, tokens, failed_pages, final_status = await execute_extraction_pipeline(
            job_id=job_id,
            image_paths=image_paths,
            original_schema=schema,
            on_progress=_emit_progress,
        )

        now = datetime.now(timezone.utc)
        update_doc: dict[str, Any] = {
            "status": final_status,
            "progress_percent": 100 if final_status != "failed" else 0,
            "raw_extraction": raw_result,
            "token_usage": tokens.model_dump(),
            "failed_pages": failed_pages,
            "completed_at": now,
            "updated_at": now,
        }
        if final_status == "failed":
            update_doc["error_message"] = "Vision extraction failed on all pages"

        await col_jobs.update_one({"_id": job_id}, {"$set": update_doc})

        await broker.publish(job_id, {
            "job_id": job_id,
            "status": final_status,
            "progress_percent": 100 if final_status != "failed" else 0,
            "token_usage": tokens.model_dump(),
            "failed_pages": failed_pages,
            "raw_extraction": raw_result,
            "completed_at": now.isoformat(),
        })

    except Exception as exc:
        logger.exception("Extraction worker error for job %s: %s", job_id, exc)
        now = datetime.now(timezone.utc)
        await col_jobs.update_one(
            {"_id": job_id},
            {"$set": {
                "status": "failed",
                "progress_percent": 0,
                "error_message": str(exc),
                "completed_at": now,
                "updated_at": now,
            }}
        )
        await broker.publish(job_id, {
            "job_id": job_id,
            "status": "failed",
            "progress_percent": 0,
            "error_message": str(exc),
            "completed_at": now.isoformat(),
        })


@router.post("/start")
async def start_extraction(req: ExtractStartRequest):
    """Start vision extraction job in background and return job_id immediately."""
    col_docs = get_documents_collection()
    doc = await col_docs.find_one({"_id": req.document_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    total_pages = doc.get("page_count", 1)
    requested_pages = _parse_page_range(req.page_range, total_pages)
    if not requested_pages:
        raise HTTPException(status_code=400, detail="Requested page range contains no pages")

    # Resolve schema
    active_schema: dict[str, Any] = {}
    schema_id = req.schema_id

    if req.json_schema:
        active_schema = req.json_schema
    elif schema_id:
        col_schemas = get_schemas_collection()
        s_doc = await col_schemas.find_one({"_id": ObjectId(schema_id) if ObjectId.is_valid(schema_id) else schema_id})
        if not s_doc:
            raise HTTPException(status_code=404, detail=f"Schema {schema_id} not found")
        active_schema = s_doc.get("json_schema", {})
    else:
        raise HTTPException(status_code=400, detail="Must provide either schema_id or json_schema")

    # Pre-flight strict normalization check (DEC-5.5, E05)
    normalize_schema_for_strict_mode(active_schema)

    job_id = str(ObjectId())
    job = ExtractionJob(
        id=job_id,
        document_id=req.document_id,
        filename=doc.get("filename", "document"),
        schema_id=schema_id,
        json_schema=active_schema,
        page_range=req.page_range,
        requested_pages=requested_pages,
        status="pending",
    )

    col_jobs = get_jobs_collection()
    job_dict = job.model_dump(by_alias=True)
    job_dict["_id"] = job_id
    await col_jobs.insert_one(job_dict)

    task = asyncio.create_task(
        _run_extraction_worker(job_id, req.document_id, requested_pages, active_schema)
    )
    _extraction_tasks.add(task)
    task.add_done_callback(_extraction_tasks.discard)

    return {"job_id": job_id, "status": "pending"}


@router.get("/stream/{job_id}")
async def stream_job_events(job_id: str):
    """Server-Sent Events endpoint broadcasting live extraction events (E11)."""
    col_jobs = get_jobs_collection()
    job = await col_jobs.find_one({"_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    async def event_generator():
        # Fallback to DB state if job is already completed/failed
        if job.get("status") in ("completed", "partial_success", "failed"):
            yield {
                "event": "message",
                "data": json.dumps({
                    "job_id": job_id,
                    "status": job.get("status"),
                    "progress_percent": job.get("progress_percent", 100),
                    "token_usage": job.get("token_usage", {}),
                    "raw_extraction": job.get("raw_extraction"),
                    "error_message": job.get("error_message"),
                }),
            }
            return

        async for data in broker.subscribe(job_id):
            yield {"event": "message", "data": json.dumps(data)}

    return EventSourceResponse(event_generator())


@router.get("/status/{job_id}", response_model=ExtractionJobResponse)
async def get_job_status(job_id: str):
    """Fallback polling endpoint for job status."""
    col_jobs = get_jobs_collection()
    job = await col_jobs.find_one({"_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    return ExtractionJobResponse(
        id=str(job["_id"]),
        document_id=job["document_id"],
        filename=job.get("filename", ""),
        schema_id=job.get("schema_id"),
        json_schema=job.get("json_schema", {}),
        page_range=job.get("page_range"),
        requested_pages=job.get("requested_pages", []),
        status=job.get("status", "pending"),
        progress_percent=job.get("progress_percent", 0),
        raw_extraction=job.get("raw_extraction"),
        token_usage=TokenUsage(**job.get("token_usage", {})),
        error_message=job.get("error_message"),
        failed_pages=job.get("failed_pages", []),
        harmonized=job.get("harmonized", False),
        harmonized_target_collection=job.get("harmonized_target_collection"),
        tenant_id=job.get("tenant_id", "default_tenant"),
        created_at=job["created_at"],
        updated_at=job["updated_at"],
        completed_at=job.get("completed_at"),
    )


@router.get("/jobs", response_model=list[ExtractionJobResponse])
@router.get("/history", response_model=list[ExtractionJobResponse])
async def list_jobs(limit: int = Query(50, ge=1, le=200)):
    """List past extraction jobs sorted by created_at desc."""
    col_jobs = get_jobs_collection()
    cursor = col_jobs.find({}).sort("created_at", -1).limit(limit)
    jobs: list[ExtractionJobResponse] = []

    async for job in cursor:
        jobs.append(
            ExtractionJobResponse(
                id=str(job["_id"]),
                document_id=job["document_id"],
                filename=job.get("filename", ""),
                schema_id=job.get("schema_id"),
                json_schema=job.get("json_schema", {}),
                page_range=job.get("page_range"),
                requested_pages=job.get("requested_pages", []),
                status=job.get("status", "pending"),
                progress_percent=job.get("progress_percent", 0),
                raw_extraction=job.get("raw_extraction"),
                token_usage=TokenUsage(**job.get("token_usage", {})),
                error_message=job.get("error_message"),
                failed_pages=job.get("failed_pages", []),
                harmonized=job.get("harmonized", False),
                harmonized_target_collection=job.get("harmonized_target_collection"),
                tenant_id=job.get("tenant_id", "default_tenant"),
                created_at=job["created_at"],
                updated_at=job["updated_at"],
                completed_at=job.get("completed_at"),
            )
        )

    return jobs
