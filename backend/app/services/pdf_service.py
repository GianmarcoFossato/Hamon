import asyncio
from datetime import datetime, timezone
import logging
import os
from pathlib import Path
import shutil
from typing import Optional
from fastapi import HTTPException, UploadFile
import filetype
from PIL import Image
import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c

from app.config import get_settings
from app.database import get_app_client, get_documents_collection, get_jobs_collection

logger = logging.getLogger(__name__)
settings = get_settings()

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB (E01)
MAX_PAGE_COUNT = 20  # 20 Pages (E01)
CHUNK_SIZE = 1024 * 1024  # 1MB chunks


class PageRenderNotifier:
    """In-memory pub/sub for page render readiness barriers."""
    def __init__(self):
        self._events: dict[str, dict[int, asyncio.Event]] = {}
        self._lock = asyncio.Lock()

    async def get_event(self, doc_id: str, page: int) -> asyncio.Event:
        async with self._lock:
            if doc_id not in self._events:
                self._events[doc_id] = {}
            if page not in self._events[doc_id]:
                self._events[doc_id][page] = asyncio.Event()
            return self._events[doc_id][page]

    async def notify_page_rendered(self, doc_id: str, page: int):
        async with self._lock:
            if doc_id in self._events and page in self._events[doc_id]:
                self._events[doc_id][page].set()

    async def cleanup(self, doc_id: str):
        async with self._lock:
            self._events.pop(doc_id, None)


page_notifier = PageRenderNotifier()


def get_doc_dir(doc_id: str) -> Path:
    doc_dir = Path(settings.UPLOAD_DIR) / doc_id
    doc_dir.mkdir(parents=True, exist_ok=True)
    return doc_dir


def _render_page_to_disk_sync(filepath: str, page_number: int, output_path: str, is_pdf: bool = True):
    """Render single page to 150 DPI PNG atomically (E06, DEC-6.2)."""
    tmp_path = f"{output_path}.tmp"
    if is_pdf:
        doc = pdfium.PdfDocument(filepath)
        try:
            # Initialize interactive forms before flattening
            doc.init_forms()
        except Exception as e:
            logger.debug(f"Form init skipped: {e}")

        page = doc[page_number]
        try:
            # Flatten annotations and interactive forms
            pdfium_c.FPDFPage_Flatten(page.raw, pdfium_c.FLAT_NORMALDISPLAY)
        except Exception as e:
            logger.debug(f"FPDFPage_Flatten notice: {e}")

        # Check dimensions and clamp scaling if > 2000 points
        width, height = page.get_width(), page.get_height()
        scale = 150.0 / 72.0  # 150 DPI
        if max(width, height) * scale > 3000:
            scale = 3000.0 / max(width, height)

        pil_image = page.render(scale=scale).to_pil()
        pil_image.save(tmp_path, format="PNG")
        page.close()
        doc.close()
    else:
        # Single image
        with Image.open(filepath) as img:
            rgb_img = img.convert("RGB")
            rgb_img.save(tmp_path, format="PNG")

    os.replace(tmp_path, output_path)


async def save_uploaded_file(upload_file: UploadFile, doc_id: str) -> tuple[str, str, int]:
    """Stream save with 50MB and 20-page guardrails (E01, E02)."""
    doc_dir = get_doc_dir(doc_id)
    raw_filename = upload_file.filename or "document.bin"
    ext = Path(raw_filename).suffix.lower() or ".bin"
    dest_path = doc_dir / f"document{ext}"

    total_bytes = 0
    with open(dest_path, "wb") as f:
        while True:
            chunk = await upload_file.read(CHUNK_SIZE)
            if not chunk:
                break
            total_bytes += len(chunk)
            if total_bytes > MAX_FILE_SIZE:
                # Cleanup and raise 413
                f.close()
                if dest_path.exists():
                    dest_path.unlink()
                raise HTTPException(status_code=413, detail=f"File exceeds maximum allowed size of {MAX_FILE_SIZE // (1024*1024)}MB")
            f.write(chunk)

    # Magic-byte check (E02)
    kind = filetype.guess(str(dest_path))
    content_type = kind.mime if kind else (upload_file.content_type or "application/octet-stream")

    is_pdf = content_type == "application/pdf" or ext == ".pdf"
    is_image = content_type.startswith("image/")

    if not is_pdf and not is_image:
        dest_path.unlink()
        raise HTTPException(status_code=400, detail=f"Unsupported file type '{content_type}'. Must be PDF or image.")

    if is_pdf:
        try:
            doc = pdfium.PdfDocument(str(dest_path))
            page_count = len(doc)
            doc.close()
        except Exception as e:
            dest_path.unlink()
            raise HTTPException(status_code=400, detail=f"Corrupted or invalid PDF file: {str(e)}")

        if page_count > MAX_PAGE_COUNT:
            dest_path.unlink()
            raise HTTPException(status_code=400, detail=f"Document exceeds maximum 20 pages limit (got {page_count} pages)")
        if page_count <= 0:
            dest_path.unlink()
            raise HTTPException(status_code=400, detail="PDF has 0 pages")
    else:
        page_count = 1

    return str(dest_path), content_type, page_count


async def render_document_background(doc_id: str, filepath: str, page_count: int, content_type: str):
    """Async background orchestrator rendering pages to 150 DPI PNGs."""
    col = get_documents_collection()
    is_pdf = content_type == "application/pdf" or filepath.endswith(".pdf")
    doc_dir = get_doc_dir(doc_id)

    await col.update_one(
        {"_id": doc_id},
        {"$set": {"render_status": "rendering", "updated_at": datetime.now(timezone.utc)}}
    )

    try:
        for page_idx in range(page_count):
            out_png = doc_dir / f"page_{page_idx}.png"
            if not out_png.exists():
                await asyncio.to_thread(_render_page_to_disk_sync, filepath, page_idx, str(out_png), is_pdf)

            # Update DB atomically
            await col.update_one(
                {"_id": doc_id},
                {
                    "$addToSet": {"rendered_pages": page_idx},
                    "$set": {"updated_at": datetime.now(timezone.utc)},
                }
            )
            await page_notifier.notify_page_rendered(doc_id, page_idx)

        await col.update_one(
            {"_id": doc_id},
            {"$set": {"render_status": "completed", "updated_at": datetime.now(timezone.utc)}}
        )
    except Exception as exc:
        logger.exception("Rendering failed for doc %s: %s", doc_id, exc)
        await col.update_one(
            {"_id": doc_id},
            {
                "$set": {
                    "render_status": "failed",
                    "error_message": str(exc),
                    "updated_at": datetime.now(timezone.utc),
                }
            }
        )


async def ensure_pages_rendered(doc_id: str, required_pages: list[int], timeout: float = 45.0) -> list[str]:
    """Page barrier awaiting required pages on disk (E06, DEC-6.2)."""
    doc_dir = get_doc_dir(doc_id)
    col = get_documents_collection()

    doc = await col.find_one({"_id": doc_id})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")

    image_paths: list[str] = []
    start_time = asyncio.get_event_loop().time()

    for p in required_pages:
        page_png = doc_dir / f"page_{p}.png"
        while not page_png.exists():
            # Check if rendering failed fast
            curr_doc = await col.find_one({"_id": doc_id}, {"render_status": 1, "error_message": 1})
            if curr_doc and curr_doc.get("render_status") == "failed":
                raise RuntimeError(f"Rendering failed: {curr_doc.get('error_message', 'Unknown render error')}")

            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed >= timeout:
                raise TimeoutError(f"Timed out waiting for page {p} of doc {doc_id} to render")

            event = await page_notifier.get_event(doc_id, p)
            try:
                await asyncio.wait_for(event.wait(), timeout=min(0.5, timeout - elapsed))
            except asyncio.TimeoutError:
                pass

        image_paths.append(str(page_png))

    return image_paths


async def delete_document_and_files(doc_id: str):
    """Headless cascade deletion of disk files and MongoDB records (DEC-1.3)."""
    # 1. Remove disk directory
    doc_dir = Path(settings.UPLOAD_DIR) / doc_id
    if doc_dir.exists():
        shutil.rmtree(doc_dir, ignore_errors=True)

    # 2. Delete document record
    col_docs = get_documents_collection()
    await col_docs.delete_one({"_id": doc_id})

    # 3. Cascade delete associated extraction jobs
    col_jobs = get_jobs_collection()
    await col_jobs.delete_many({"document_id": doc_id})

    # 4. Clean in-memory notifier
    await page_notifier.cleanup(doc_id)
