from datetime import datetime, timezone
from typing import Any
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status

from app.database import get_schemas_collection
from app.models.schema import (
    SchemaCreate,
    SchemaResponse,
    SchemaUpdate,
    validate_draft7_schema,
)

router = APIRouter(prefix="/api/schemas", tags=["schemas"])


def parse_object_id(schema_id: str) -> ObjectId:
    """Parses a string into a BSON ObjectId, raising 404 if invalid."""
    try:
        return ObjectId(schema_id)
    except (InvalidId, TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schema not found with id: {schema_id}",
        )


def doc_to_schema_response(doc: dict[str, Any]) -> SchemaResponse:
    """Transforms a MongoDB schema document into a typed SchemaResponse."""
    now = datetime.now(timezone.utc)
    return SchemaResponse(
        id=str(doc["_id"]),
        name=doc["name"],
        description=doc.get("description"),
        json_schema=doc["json_schema"],
        created_at=doc.get("created_at") or now,
        updated_at=doc.get("updated_at") or now,
    )


@router.post(
    "",
    response_model=SchemaResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new JSON Schema definition",
)
async def create_schema(
    payload: SchemaCreate,
    col=Depends(get_schemas_collection),
) -> SchemaResponse:
    validate_draft7_schema(payload.json_schema)

    now = datetime.now(timezone.utc)
    document = {
        "name": payload.name,
        "description": payload.description,
        "json_schema": payload.json_schema,
        "created_at": now,
        "updated_at": now,
    }

    result = await col.insert_one(document)
    document["_id"] = result.inserted_id
    return doc_to_schema_response(document)


@router.get(
    "",
    response_model=list[SchemaResponse],
    summary="List all schema definitions",
)
async def list_schemas(
    col=Depends(get_schemas_collection),
) -> list[SchemaResponse]:
    cursor = col.find()
    if hasattr(cursor, "to_list"):
        docs = await cursor.to_list(length=1000)
    else:
        docs = [d async for d in cursor]
    return [doc_to_schema_response(doc) for doc in docs]


@router.get(
    "/{schema_id}",
    response_model=SchemaResponse,
    summary="Retrieve a schema definition by ID",
)
async def get_schema(
    schema_id: str,
    col=Depends(get_schemas_collection),
) -> SchemaResponse:
    oid = parse_object_id(schema_id)
    doc = await col.find_one({"_id": oid})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schema not found with id: {schema_id}",
        )
    return doc_to_schema_response(doc)


@router.put(
    "/{schema_id}",
    response_model=SchemaResponse,
    summary="Update an existing schema definition",
)
async def update_schema(
    schema_id: str,
    payload: SchemaUpdate,
    col=Depends(get_schemas_collection),
) -> SchemaResponse:
    oid = parse_object_id(schema_id)

    update_fields: dict[str, Any] = {}
    if payload.name is not None:
        update_fields["name"] = payload.name
    if payload.description is not None:
        update_fields["description"] = payload.description
    if payload.json_schema is not None:
        validate_draft7_schema(payload.json_schema)
        update_fields["json_schema"] = payload.json_schema

    update_fields["updated_at"] = datetime.now(timezone.utc)

    result = await col.update_one({"_id": oid}, {"$set": update_fields})
    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schema not found with id: {schema_id}",
        )

    updated_doc = await col.find_one({"_id": oid})
    if not updated_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schema not found with id: {schema_id}",
        )

    return doc_to_schema_response(updated_doc)


@router.delete(
    "/{schema_id}",
    summary="Delete a schema definition",
)
async def delete_schema(
    schema_id: str,
    col=Depends(get_schemas_collection),
) -> dict[str, str]:
    oid = parse_object_id(schema_id)
    result = await col.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schema not found with id: {schema_id}",
        )
    return {"status": "deleted", "id": schema_id}
