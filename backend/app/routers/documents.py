import asyncio
import logging
import os
from pathlib import Path
from bson import ObjectId
from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.config import get_settings
from app.database import get_documents_collection
from app.models.document import DocumentMetadata, DocumentResponse
from app.services.pdf_service import (
    delete_document_and_files,
    ensure_pages_rendered,
    render_document_background,
    save_uploaded_file,
)

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/api/documents", tags=["documents"])

# Retain strong references to background rendering tasks (DEC-2.2)
_document_tasks: set[asyncio.Task] = set()


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(file: UploadFile = File(...)):
    """Upload PDF/image, stream to disk with 50MB/20-page limits, and start background rendering."""
    doc_id = str(ObjectId())
    filepath, content_type, page_count = await save_uploaded_file(file, doc_id)
    file_size = os.path.getsize(filepath)

    meta = DocumentMetadata(
        id=doc_id,
        filename=file.filename or "document.bin",
        content_type=content_type,
        file_size=file_size,
        file_path=filepath,
        page_count=page_count,
        render_status="pending",
    )

    col = get_documents_collection()
    doc_dict = meta.model_dump(by_alias=True)
    doc_dict["_id"] = doc_id
    await col.insert_one(doc_dict)

    # Spawn async background orchestrator
    task = asyncio.create_task(
        render_document_background(doc_id, filepath, page_count, content_type)
    )
    _document_tasks.add(task)
    task.add_done_callback(_document_tasks.discard)

    return DocumentResponse(**meta.model_dump())


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(doc_id: str):
    """Retrieve document metadata and current render status."""
    col = get_documents_collection()
    doc = await col.find_one({"_id": doc_id})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")

    return DocumentResponse(
        id=str(doc["_id"]),
        filename=doc["filename"],
        content_type=doc["content_type"],
        file_size=doc["file_size"],
        page_count=doc["page_count"],
        rendered_pages=doc.get("rendered_pages", []),
        render_status=doc.get("render_status", "pending"),
        error_message=doc.get("error_message"),
        tenant_id=doc.get("tenant_id", "default_tenant"),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


@router.get("/{doc_id}/file")
async def get_document_file(doc_id: str):
    """Stream raw document binary with path traversal guard."""
    col = get_documents_collection()
    doc = await col.find_one({"_id": doc_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = Path(doc["file_path"]).resolve()
    base_dir = Path(settings.UPLOAD_DIR).resolve()

    # Path traversal check
    if not str(file_path).startswith(str(base_dir)):
        raise HTTPException(status_code=403, detail="Forbidden file access")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Underlying document file not found on disk")

    return FileResponse(
        path=str(file_path),
        media_type=doc.get("content_type", "application/octet-stream"),
        filename=doc.get("filename", "document"),
    )


@router.get("/{doc_id}/pages/{page_number}")
async def get_document_page_image(doc_id: str, page_number: int):
    """Ensure requested page is rendered, then stream 150 DPI PNG."""
    col = get_documents_collection()
    doc = await col.find_one({"_id": doc_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if page_number < 0 or page_number >= doc.get("page_count", 1):
        raise HTTPException(
            status_code=400,
            detail=f"Page number {page_number} out of bounds (document has {doc.get('page_count', 1)} pages)",
        )

    try:
        image_paths = await ensure_pages_rendered(doc_id, [page_number])
        img_path = image_paths[0]
        return FileResponse(path=img_path, media_type="image/png")
    except TimeoutError as te:
        raise HTTPException(status_code=504, detail=str(te))
    except RuntimeError as re:
        raise HTTPException(status_code=500, detail=str(re))


@router.delete("/{doc_id}")
async def delete_document(doc_id: str):
    """Headless cascade deletion of disk files and DB records (DEC-1.3)."""
    col = get_documents_collection()
    doc = await col.find_one({"_id": doc_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    await delete_document_and_files(doc_id)
    return {"deleted": True, "id": doc_id}
