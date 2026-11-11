from datetime import datetime, timezone
import pytest
from bson import ObjectId
from httpx import ASGITransport, AsyncClient

from app.database import get_schemas_collection, seed_default_schemas
from app.main import app
from app.models.schema import validate_draft7_schema


class MockInsertResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id


class MockUpdateResult:
    def __init__(self, matched_count, modified_count):
        self.matched_count = matched_count
        self.modified_count = modified_count


class MockDeleteResult:
    def __init__(self, deleted_count):
        self.deleted_count = deleted_count


class MockCursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, length=None):
        return list(self.docs)

    def __aiter__(self):
        async def gen():
            for d in self.docs:
                yield d
        return gen()


class MockSchemasCollection:
    def __init__(self):
        self.storage: dict[ObjectId, dict] = {}

    async def insert_one(self, doc):
        oid = doc.get("_id") or ObjectId()
        stored = dict(doc)
        stored["_id"] = oid
        self.storage[oid] = stored
        return MockInsertResult(oid)

    async def insert_many(self, docs):
        oids = []
        for d in docs:
            oid = d.get("_id") or ObjectId()
            stored = dict(d)
            stored["_id"] = oid
            self.storage[oid] = stored
            oids.append(oid)
        return oids

    async def find_one(self, filter_dict):
        target_id = filter_dict.get("_id")
        if target_id in self.storage:
            return dict(self.storage[target_id])
        return None

    def find(self, filter_dict=None):
        return MockCursor(list(self.storage.values()))

    async def update_one(self, filter_dict, update_dict):
        target_id = filter_dict.get("_id")
        if target_id not in self.storage:
            return MockUpdateResult(matched_count=0, modified_count=0)
        current = self.storage[target_id]
        if "$set" in update_dict:
            for k, v in update_dict["$set"].items():
                current[k] = v
        return MockUpdateResult(matched_count=1, modified_count=1)

    async def delete_one(self, filter_dict):
        target_id = filter_dict.get("_id")
        if target_id in self.storage:
            del self.storage[target_id]
            return MockDeleteResult(deleted_count=1)
        return MockDeleteResult(deleted_count=0)

    async def count_documents(self, filter_dict=None):
        return len(self.storage)


@pytest.fixture
def mock_collection():
    collection = MockSchemasCollection()
    app.dependency_overrides[get_schemas_collection] = lambda: collection
    yield collection
    app.dependency_overrides.pop(get_schemas_collection, None)


@pytest.mark.asyncio
async def test_create_schema_invalid_draft7(mock_collection):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Root type not an object
        res_non_object = await ac.post(
            "/api/schemas",
            json={
                "name": "Invalid Root Type",
                "json_schema": {"type": "string"},
            },
        )
        assert res_non_object.status_code == 400
        assert "Schema root 'type' must be 'object'" in res_non_object.json()["detail"]

        # 2. Invalid Draft-07 property definition (invalid type keyword)
        res_invalid_draft7 = await ac.post(
            "/api/schemas",
            json={
                "name": "Invalid Draft-07 Property",
                "json_schema": {
                    "type": "object",
                    "properties": {
                        "amount": {"type": "invalid_type_name"}
                    },
                },
            },
        )
        assert res_invalid_draft7.status_code == 400
        assert "Invalid Draft-07 JSON Schema" in res_invalid_draft7.json()["detail"]

        # 3. Missing type field entirely
        res_missing_type = await ac.post(
            "/api/schemas",
            json={
                "name": "Missing Type",
                "json_schema": {"properties": {}},
            },
        )
        assert res_missing_type.status_code == 400


@pytest.mark.asyncio
async def test_full_crud_lifecycle(mock_collection):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        valid_schema = {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "properties": {
                "patient_name": {"type": "string"},
                "test_code": {"type": "string"},
            },
            "required": ["patient_name"],
        }

        # 1. POST /api/schemas
        post_res = await ac.post(
            "/api/schemas",
            json={
                "name": "Blood Panel",
                "description": "Standard blood analysis schema",
                "json_schema": valid_schema,
            },
        )
        assert post_res.status_code == 201
        created_data = post_res.json()
        schema_id = created_data["id"]
        assert created_data["name"] == "Blood Panel"
        assert created_data["description"] == "Standard blood analysis schema"
        assert created_data["json_schema"] == valid_schema
        assert "created_at" in created_data
        assert "updated_at" in created_data

        # 2. GET /api/schemas
        list_res = await ac.get("/api/schemas")
        assert list_res.status_code == 200
        items = list_res.json()
        assert len(items) == 1
        assert items[0]["id"] == schema_id

        # 3. GET /api/schemas/{id}
        get_res = await ac.get(f"/api/schemas/{schema_id}")
        assert get_res.status_code == 200
        assert get_res.json()["name"] == "Blood Panel"

        # 4. PUT /api/schemas/{id} with invalid Draft-07 schema
        bad_put_res = await ac.put(
            f"/api/schemas/{schema_id}",
            json={
                "json_schema": {"type": "boolean"},
            },
        )
        assert bad_put_res.status_code == 400

        # 5. PUT /api/schemas/{id} valid partial update
        updated_schema = {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "properties": {
                "patient_name": {"type": "string"},
                "test_code": {"type": "string"},
                "notes": {"type": "string"},
            },
            "required": ["patient_name", "test_code"],
        }
        put_res = await ac.put(
            f"/api/schemas/{schema_id}",
            json={
                "name": "Advanced Blood Panel",
                "json_schema": updated_schema,
            },
        )
        assert put_res.status_code == 200
        updated_data = put_res.json()
        assert updated_data["name"] == "Advanced Blood Panel"
        assert updated_data["description"] == "Standard blood analysis schema"
        assert updated_data["json_schema"] == updated_schema

        # 6. DELETE /api/schemas/{id}
        del_res = await ac.delete(f"/api/schemas/{schema_id}")
        assert del_res.status_code == 200
        assert del_res.json() == {"status": "deleted", "id": schema_id}

        # 7. GET /api/schemas/{id} after deletion returns 404
        post_del_get = await ac.get(f"/api/schemas/{schema_id}")
        assert post_del_get.status_code == 404


@pytest.mark.asyncio
async def test_404_on_invalid_and_nonexistent_ids(mock_collection):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        invalid_oid = "not-a-valid-object-id"
        nonexistent_oid = "507f1f77bcf86cd799439011"

        # Invalid ObjectId string returns 404
        assert (await ac.get(f"/api/schemas/{invalid_oid}")).status_code == 404
        assert (await ac.put(f"/api/schemas/{invalid_oid}", json={"name": "foo"})).status_code == 404
        assert (await ac.delete(f"/api/schemas/{invalid_oid}")).status_code == 404

        # Nonexistent valid ObjectId returns 404
        assert (await ac.get(f"/api/schemas/{nonexistent_oid}")).status_code == 404
        assert (await ac.put(f"/api/schemas/{nonexistent_oid}", json={"name": "foo"})).status_code == 404
        assert (await ac.delete(f"/api/schemas/{nonexistent_oid}")).status_code == 404


@pytest.mark.asyncio
async def test_seeded_default_templates(mock_collection):
    await seed_default_schemas(mock_collection)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/schemas")
        assert res.status_code == 200
        items = res.json()
        assert len(items) == 2

        names = {item["name"]: item for item in items}
        assert "Commercial Invoice" in names
        assert "Clinical / Lab Report" in names

        # Validate Draft-07 conformance for both
        for item in items:
            validate_draft7_schema(item["json_schema"])
            assert item["json_schema"]["type"] == "object"
            assert "created_at" in item
            assert "updated_at" in item

        # Verify Commercial Invoice fields
        invoice_props = names["Commercial Invoice"]["json_schema"]["properties"]
        assert "invoice_number" in invoice_props
        assert "invoice_date" in invoice_props
        assert "vendor_name" in invoice_props
        assert "total_amount" in invoice_props
        assert "line_items" in invoice_props

        # Verify Clinical / Lab Report fields
        lab_props = names["Clinical / Lab Report"]["json_schema"]["properties"]
        assert "patient_name" in lab_props
        assert "patient_id" in lab_props
        assert "specimen_collection_date" in lab_props
        assert "ordering_physician" in lab_props
        assert "test_results" in lab_props

        # Verify idempotency: running seed again does not duplicate
        await seed_default_schemas(mock_collection)
        res2 = await ac.get("/api/schemas")
        assert len(res2.json()) == 2


@pytest.mark.asyncio
async def test_seeding_handles_offline_db_gracefully(monkeypatch):
    def failing_get_col():
        raise ConnectionError("MongoDB unreachable")

    monkeypatch.setattr("app.database.get_schemas_collection", failing_get_col)
    # Should not raise any exception, simply logs a warning
    await seed_default_schemas()

