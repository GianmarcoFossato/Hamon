from datetime import datetime, timezone
import logging
from typing import Any, Optional
from bson import ObjectId
from fastapi import APIRouter, HTTPException, status
import pandas as pd

from app.database import (
    get_harmonization_profiles_collection,
    get_jobs_collection,
    get_target_client,
    get_target_db,
)
from app.models.harmonization import (
    CommitRequest,
    CommitResponse,
    FieldMappingItem,
    HarmonizationProfile,
    HarmonizationProfileResponse,
    PreviewRequest,
    PreviewResponse,
    SchemaMatchCandidate,
    SchemaMatchRequest,
    ValueMatchRequest,
)
from app.services.bdi_service import (
    json_extraction_to_dataframe,
    match_schema,
    match_values,
    materialize_and_cast,
    target_collection_to_dataframe,
    validate_collection_name,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/harmonize", tags=["harmonize"])


@router.get("/target/collections")
async def get_target_collections():
    """List available collections in the target enterprise MongoDB (E16, E17)."""
    try:
        db = get_target_db()
        names = await db.list_collection_names()
        # Filter system and hidden collections
        valid_collections = [
            n for n in names
            if not n.startswith("system.") and not n.startswith("$")
        ]
        return valid_collections
    except Exception as e:
        logger.warning(f"Failed to list target collections: {e}")
        return []


@router.get("/methods")
async def get_matching_methods():
    """List available schema matching methods."""
    return [
        {"id": "llm", "name": "LLM Semantic Matcher (Default)", "description": "Prompt-driven semantic alignment via LiteLLM"},
        {"id": "heuristic", "name": "Token Jaccard Heuristic", "description": "Lightweight token similarity and field naming hints"},
        {"id": "similarity_flooding", "name": "Similarity Flooding (BDI-Kit)", "description": "Graph-based structural matching algorithm"},
        {"id": "jaccard_distance", "name": "Jaccard Distance (BDI-Kit)", "description": "N-gram and token set distance"},
    ]


@router.post("/match-schema", response_model=list[SchemaMatchCandidate])
async def match_schema_endpoint(req: SchemaMatchRequest):
    """Propose source-to-target field alignments with confidence scores."""
    validate_collection_name(req.target_collection)

    target_df = await target_collection_to_dataframe(req.target_collection)
    if target_df.empty:
        # Introspect or provide empty fallback
        return []

    # Build dummy or sample source DataFrame
    source_df = pd.DataFrame(columns=req.source_fields)
    if req.source_samples:
        for col, samples in req.source_samples.items():
            if col in source_df.columns:
                source_df[col] = samples[:len(source_df)] if len(source_df) > 0 else samples

    matches = await match_schema(
        source_df=source_df,
        target_df=target_df,
        method=req.method,
        source_samples=req.source_samples,
    )

    candidates = [
        SchemaMatchCandidate(
            source_attribute=m["source_attribute"],
            target_attribute=m["target_attribute"],
            similarity=m["similarity"],
            suggested_transform=m.get("suggested_transform", "direct"),
        )
        for m in matches
    ]
    return candidates


@router.post("/match-values")
async def match_values_endpoint(req: ValueMatchRequest):
    """Propose categorical dictionary value alignments."""
    validate_collection_name(req.target_collection)
    target_df = await target_collection_to_dataframe(req.target_collection)
    source_df = pd.DataFrame({req.source_col: req.source_values})

    matches = match_values(source_df, target_df, req.source_col, req.target_col)
    return {"matches": matches}


@router.post("/preview", response_model=PreviewResponse)
async def preview_harmonization(req: PreviewRequest):
    """Live 300ms debounced preview returning raw vs harmonized diff and diagnostics (DEC-7.3)."""
    validate_collection_name(req.target_collection)
    raw_data = req.raw_data

    if not raw_data and req.job_id:
        col_jobs = get_jobs_collection()
        job = await col_jobs.find_one({"_id": req.job_id})
        if job:
            raw_data = job.get("raw_extraction")

    if not raw_data:
        return PreviewResponse(diagnostics=["No raw data available for preview"])

    source_df = json_extraction_to_dataframe(raw_data, req.root_array_path)
    if source_df.empty:
        return PreviewResponse(diagnostics=["Extracted data could not be normalized into tabular rows"])

    materialized, diagnostics = materialize_and_cast(source_df, req.field_mappings)

    sample_raw = source_df.iloc[0].to_dict() if not source_df.empty else None
    sample_harmonized = materialized[0] if materialized else None

    # First 10 preview rows
    preview_rows = materialized[:10]

    return PreviewResponse(
        sample_raw=sample_raw,
        sample_harmonized=sample_harmonized,
        preview_rows=preview_rows,
        diagnostics=diagnostics,
        total_records=len(materialized),
    )


# Harmonization Profiles CRUD
@router.get("/profiles", response_model=list[HarmonizationProfileResponse])
async def list_profiles():
    col = get_harmonization_profiles_collection()
    cursor = col.find({}).sort("updated_at", -1)
    profiles = []
    async for p in cursor:
        profiles.append(
            HarmonizationProfileResponse(
                id=str(p["_id"]),
                name=p["name"],
                source_schema_id=p.get("source_schema_id"),
                target_collection=p["target_collection"],
                field_mappings=[FieldMappingItem(**m) for m in p.get("field_mappings", [])],
                tenant_id=p.get("tenant_id", "default_tenant"),
                created_at=p["created_at"],
                updated_at=p["updated_at"],
            )
        )
    return profiles


@router.post("/profiles", response_model=HarmonizationProfileResponse)
async def save_profile(profile: HarmonizationProfile):
    col = get_harmonization_profiles_collection()
    pid = profile.id or str(ObjectId())
    now = datetime.now(timezone.utc)
    p_dict = profile.model_dump()
    p_dict["_id"] = pid
    p_dict["updated_at"] = now
    if not p_dict.get("created_at"):
        p_dict["created_at"] = now

    await col.update_one({"_id": pid}, {"$set": p_dict}, upsert=True)
    return HarmonizationProfileResponse(**p_dict)


@router.delete("/profiles/{profile_id}")
async def delete_profile(profile_id: str):
    col = get_harmonization_profiles_collection()
    res = await col.delete_one({"_id": profile_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"deleted": True, "id": profile_id}


@router.post("/commit", response_model=CommitResponse)
async def commit_harmonization(req: CommitRequest):
    """Guarded 2-phase commit with lease acquisition, compensating rollback, and upsert null-key quarantine (DEC-5.1, DEC-5.2, E12)."""
    validate_collection_name(req.target_collection)
    col_jobs = get_jobs_collection()

    # 1. Phase 1: Acquire atomic commit lease
    job = await col_jobs.find_one_and_update(
        {"_id": req.job_id, "commit_in_progress": {"$ne": True}},
        {
            "$set": {
                "commit_in_progress": True,
                "status": "harmonizing",
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
    if not job:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Commit lease acquisition failed: Job is already being committed or not found",
        )

    raw_data = job.get("raw_extraction")
    if not raw_data:
        # Release lease
        await col_jobs.update_one(
            {"_id": req.job_id},
            {"$set": {"commit_in_progress": False, "status": "completed"}}
        )
        raise HTTPException(status_code=400, detail="Job has no extracted data to harmonize")

    # 2. Materialize documents
    source_df = json_extraction_to_dataframe(raw_data, req.root_array_path)
    records, diagnostics = materialize_and_cast(source_df, req.field_mappings, tenant_id=job.get("tenant_id", "default_tenant"))

    if not records:
        await col_jobs.update_one(
            {"_id": req.job_id},
            {"$set": {"commit_in_progress": False, "status": "completed"}}
        )
        raise HTTPException(status_code=400, detail="No records were materialized from field mappings")

    # 3. Phase 2: Insert into Target Enterprise MongoDB
    target_client = get_target_client()
    try:
        db = target_client.get_default_database()
    except Exception:
        db = target_client["company_enterprise_db"]

    target_col = db[req.target_collection]

    inserted_count = 0
    upserted_count = 0
    quarantined_count = 0

    try:
        if req.mode == "append" or not req.business_key:
            res = await target_col.insert_many(records)
            inserted_count = len(res.inserted_ids)
        else:
            # Upsert by business key with null-key quarantine guard (DEC-5.1, E12)
            bkey = req.business_key
            for rec in records:
                # Find business key value in nested doc or flat
                val = rec.get(bkey)
                if val is None:
                    # Quarantine null-key records into quarantine collection
                    quarantine_col = db[f"{req.target_collection}_quarantine"]
                    rec["_quarantine_reason"] = f"Missing or null business key '{bkey}'"
                    rec["_quarantined_at"] = datetime.now(timezone.utc)
                    await quarantine_col.insert_one(rec)
                    quarantined_count += 1
                    continue

                up_res = await target_col.update_one(
                    {bkey: val, "tenant_id": rec.get("tenant_id", "default_tenant")},
                    {"$set": rec},
                    upsert=True,
                )
                if up_res.upserted_id:
                    upserted_count += 1
                else:
                    inserted_count += 1

        # 4. Success: Finalize job state
        now = datetime.now(timezone.utc)
        await col_jobs.update_one(
            {"_id": req.job_id},
            {
                "$set": {
                    "status": "completed",
                    "harmonized": True,
                    "harmonized_target_collection": req.target_collection,
                    "commit_in_progress": False,
                    "updated_at": now,
                }
            },
        )

        return CommitResponse(
            inserted_count=inserted_count,
            upserted_count=upserted_count,
            quarantined_count=quarantined_count,
            target_collection=req.target_collection,
            status="committed",
            message=f"Successfully committed {inserted_count + upserted_count} records to {req.target_collection}"
            + (f" ({quarantined_count} quarantined)" if quarantined_count > 0 else ""),
        )

    except Exception as exc:
        logger.exception("Harmonization commit failed, executing compensating rollback: %s", exc)
        # Compensating rollback to 'harmonize_failed' (DEC-5.2)
        await col_jobs.update_one(
            {"_id": req.job_id},
            {
                "$set": {
                    "status": "harmonize_failed",
                    "commit_in_progress": False,
                    "error_message": f"Commit failed: {str(exc)}",
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
        raise HTTPException(
            status_code=500,
            detail=f"Database commit failed with compensating rollback: {str(exc)}",
        )
