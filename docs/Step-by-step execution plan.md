# Antigravity Step-by-Step Execution Plan

This document contains the step-by-step instructions to paste into Antigravity to build out the entire **PDF Extraction & Data Harmonization Platform** (powered by `retab-ui`, `pypdfium2`, `litellm`, and NYU VIDA's `bdi-kit`).

---

## How to Link External Repos & Documentation Sites (For You)

Because Antigravity cannot natively "see" inside external GitHub repositories unless they are on your disk, **Phase 0** sets up two files at the root of your project:
1. **`references.json`**: A simple bookmark file containing two lists:
   - `"repositories"`: GitHub repositories you want Antigravity to inspect (pre-configured with `retab-ui` and `VIDA-NYU/bdi-kit`).
   - `"documentation_sites"`: Official documentation URLs you want Antigravity to fetch and read.
2. **`scripts/sync_references.py`**: A helper script that shallow-downloads the repositories listed in `references.json` into a hidden `.reference/repos/` folder (which is ignored by Git so external code never pollutes your repository) and downloads documentation snapshots into `.reference/docs/`.

> [!TIP]
> **How to add or remove a repo or doc site at any time:**
> 1. Open `references.json` and add or remove a URL in `"repositories"` or `"documentation_sites"`.
> 2. Run `python3 scripts/sync_references.py` in your terminal (or tell Antigravity: *"Sync my references"*).
> 3. Because of `.agents/rules/no-hallucinations.md`, Antigravity will automatically read the real source code inside `.reference/repos/` instead of guessing!

---

## Phase 0: Environment, Docker & Reference Linker Setup

### 📋 Antigravity Prompt (Copy & Paste):
```text
Task: Initialize Phase 0 — Project environment configuration, dual MongoDB Docker setup, and the External Repository & Documentation Linker system.

Context:
- We are building a commercial closed-source monorepo (Next.js in `frontend/`, FastAPI in `backend/`).
- Only permissive licenses (MIT, Apache-2.0, BSD) may be used.
- Before writing application code, we need our Docker databases running and our Reference Linker (`references.json` + `scripts/sync_references.py`) active so you can read the real source code of `retab-ui` and `VIDA-NYU/bdi-kit` locally inside `.reference/`.

Requirements:
1. Root `.gitignore`:
   - Ignore Node (`node_modules/`, `.next/`), Python (`__pycache__/`, `.venv/`, `venv/`, `*.pyc`), environment files (`.env`, `.env.*`, except `.env.example`), uploaded runtime files (`backend/data/uploads/`), and the local reference cache (`.reference/`).

2. Root `.env.example` and `.env`:
   - Create both `.env.example` and a working local `.env` with the following exact values (note the distinct ports 27017 and 27018 for the two MongoDB instances):
     ```env
     # Internal Application Database (Port 27017)
     APP_MONGODB_URI=mongodb://localhost:27017/extraction_app_db

     # Target Enterprise Database for Harmonization (Port 27018 on host -> 27017 in container)
     TARGET_MONGODB_URI=mongodb://localhost:27018/company_enterprise_db

     # LLM Provider Configuration (Used by LiteLLM & BDI-Kit)
     LLM_API_BASE=https://api.openai.com/v1
     LLM_API_KEY=your_api_key_here
     LLM_MODEL=openai/gpt-4o
     OPENAI_API_KEY=your_api_key_here

     # Backend Service
     BACKEND_PORT=8001
     UPLOAD_DIR=./data/uploads

     # Frontend Service
     NEXT_PUBLIC_API_URL=http://localhost:8001/api
     ```

3. Root `docker-compose.yml`:
   - Define two MongoDB 7 containers with healthchecks and named volumes:
     - `mongo-app`: maps `"27017:27017"`, volume `mongo_app_data:/data/db`.
     - `mongo-target`: maps `"27018:27017"`, volume `mongo_target_data:/data/db`.

4. External Repository & Documentation Registry (`references.json`):
   - Create `references.json` at the project root so the user can easily add or remove linked repositories and documentation URLs:
     ```json
     {
       "repositories": [
         {
           "name": "retab-ui",
           "url": "https://github.com/retab-dev/retab-ui.git",
           "branch": "main",
           "description": "Source for @retab/schema-builder and @retab/file-viewer shadcn registry components"
         },
         {
           "name": "bdi-kit",
           "url": "https://github.com/VIDA-NYU/bdi-kit.git",
           "branch": "devel",
           "description": "NYU VIDA BDI-Kit library for schema matching, value matching, and data harmonization"
         },
         {
           "name": "lift",
           "url": "https://github.com/datalab-to/lift.git",
           "branch": "master",
           "description": "Lift extracts structured JSON from PDFs and images by passing a schema (use api call instead of datalab's model)."
         }
       ],
       "documentation_sites": [
         {
           "name": "bdi-kit-docs",
           "url": "https://bdi-kit.readthedocs.io/stable/",
           "key_pages": [
             "https://bdi-kit.readthedocs.io/stable/quick-start.html",
             "https://bdi-kit.readthedocs.io/stable/how-works.html",
             "https://bdi-kit.readthedocs.io/stable/schema-matching.html",
             "https://bdi-kit.readthedocs.io/stable/value-matching.html",
             "https://bdi-kit.readthedocs.io/stable/installation.html"
           ]
         },
         {
           "name": "retab-ui-docs",
           "url": "https://ui.retab.com/docs",
           "key_pages": [
             "https://ui.retab.com/docs/components/file-viewer",
             "https://ui.retab.com/docs/components",
             "https://ui.retab.com/r/schema-builder.json"
           ]
         },
         {
           "name": "litellm-docs",
           "url": "https://docs.litellm.ai/docs/completion/json_mode",
           "key_pages": [
             "https://docs.litellm.ai/docs/completion/vision"
           ]
         }
       ]
     }
     ```

5. Automated Sync Script (`scripts/sync_references.py`):
   - Using only Python standard library modules (`json`, `subprocess`, `urllib.request`, `pathlib`, `shutil`), create `scripts/sync_references.py` that:
     - Reads `references.json`.
     - For each item in `"repositories"`: if `.reference/repos/{name}` does not exist, runs `git clone --depth 1 --branch {branch} {url} .reference/repos/{name}` (falling back to default branch if `{branch}` fails). If it already exists, runs `git -C .reference/repos/{name} pull --ff-only`.
     - Removes any folder inside `.reference/repos/` that is no longer listed in `references.json`.
     - For each item in `"documentation_sites"`: fetches the HTML/JSON of `url` and `key_pages` into `.reference/docs/{name}/` (handling network errors gracefully).
     - Generates `.reference/INDEX.md` listing the exact local file tree (top 2 levels) of every cloned repo in `.reference/repos/` and the cached doc paths so Antigravity can inspect them immediately.

Verification:
- Run `python3 scripts/sync_references.py` and confirm `.reference/repos/retab-ui`, `.reference/repos/bdi-kit`, and `.reference/INDEX.md` are populated on disk.
- Start the databases with `docker compose up -d` and verify both `mongo-app` (port 27017) and `mongo-target` (port 27018) are healthy.
```

---

## Phase 1: Monorepo Scaffolding (FastAPI + Next.js + Dev Container)

### 📋 Antigravity Prompt (Copy & Paste):
```text
Task: Scaffold the Dev Container environment, FastAPI backend (`backend/`), Next.js frontend (`frontend/`), and root orchestration for the monorepo, verifying connectivity to both MongoDB containers on backend port 8001.

Context:
- Before starting, verify that `.reference/INDEX.md` is populated (run `python3 scripts/sync_references.py` if missing).
- Note that `motor` is deprecated; use PyMongo's native `AsyncMongoClient` (`from pymongo import AsyncMongoClient`).
- Backend runs on port 8001 (`BACKEND_PORT=8001`).
- Frontend uses Next.js 14 LTS (React 18) for maximum peer-dependency stability with `@retab/schema-builder` and shadcn/ui.
- Backend lifespan must be resilient: if MongoDB is still booting, the server starts cleanly and `/api/health` indicates individual DB reachability without crashing.

Requirements:
1. Unified Dev Container Configuration (`.devcontainer/`):
   - Create `.devcontainer/devcontainer.json` referencing a unified Docker Compose setup (`.devcontainer/docker-compose.yml` extending or integrating the root `docker-compose.yml`).
   - Image/Dockerfile includes Python 3.12+ and Node.js 20 LTS, with VS Code extensions for Python, Pylance, Tailwind CSS, and ESLint.
   - Forwards ports 3000 (frontend), 8001 (backend), 27017 (`mongo-app`), and 27018 (`mongo-target`).

2. Backend Scaffolding (`backend/`):
   - Create `pyproject.toml` and `requirements.txt` with permissive-licensed packages:
     `fastapi>=0.115.0`, `uvicorn[standard]>=0.30.0`, `pydantic-settings>=2.4.0`, `pymongo>=4.10.0`, `pypdfium2>=4.30.0`, `pillow>=10.4.0`, `litellm>=1.50.0`, `bdi-kit>=0.11.0`, `pandas>=2.2.0`, `python-multipart>=0.0.9`, `httpx>=0.27.0`, `sse-starlette>=2.1.0`, `filetype>=1.2.0`, `json-schema-to-pydantic>=0.4.11`, `pytest>=8.3.0`, `pytest-asyncio>=0.24.0`.
   - Create `backend/app/config.py` using `pydantic-settings` (`SettingsConfigDict(env_file="../.env", extra="ignore")`) loading `APP_MONGODB_URI`, `TARGET_MONGODB_URI`, `LLM_API_BASE`, `LLM_API_KEY`, `LLM_MODEL`, `BACKEND_PORT` (default 8001), and `UPLOAD_DIR`.
   - Create `backend/app/database.py` initializing two `AsyncMongoClient` instances (`app_client` -> `app_db` and `target_client` -> `target_db`). Implement non-blocking lifespan connection handling (log warning on connection error, do not crash on launch) and expose `ping_databases() -> dict[str, bool]`.
   - Create `backend/app/main.py` with FastAPI, lifespan handler, CORS middleware allowing `http://localhost:3000` and `http://localhost:3001`, and `GET /api/health` returning `{ "status": "ok", "databases": { "app_db": bool, "target_db": bool } }`.
   - Create `backend/tests/test_health.py` with pytest tests verifying `/api/health` returns 200 with database status structure using FastAPI `AsyncClient` / `TestClient`.

3. Frontend Scaffolding (`frontend/`):
   - Initialize Next.js 14 LTS (`create-next-app` pinned to Next.js 14 with React 18, TypeScript, Tailwind CSS, App Router, `src/` directory) non-interactively.
   - Install utility packages: `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`.
   - Configure `frontend/components.json` for shadcn/ui and register the `@retab` registry URL (`"registries": { "@retab": "https://ui.retab.com/r/{name}.json" }`).
   - Create `frontend/src/lib/api-client.ts` pointing to `process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api"`.
   - Update `frontend/src/app/page.tsx` with a starter workbench shell displaying backend connection status fetched from `GET /api/health`.

4. Root Monorepo Orchestration:
   - Create root `package.json` with `concurrently`:
     - `"scripts": { "dev": "concurrently -n \"API,WEB\" -c \"blue,green\" \"npm run dev:backend\" \"npm run dev:frontend\"", "dev:backend": "cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload", "dev:frontend": "cd frontend && npm run dev", "test": "cd backend && pytest && cd ../frontend && npm run build" }`

Verification:
- Run automated tests: `cd backend && pytest tests/` confirming health endpoint tests pass.
- Run `npm run build` in `frontend/` to confirm Next.js 14 compiles with zero errors.
- Start dev environment with `npm run dev` and verify `GET http://localhost:8001/api/health` returns connection status and `http://localhost:3000` renders the starter workbench.
```

---

## Phase 2: Grounded Retab UI Integration & Schema Management

### 📋 Antigravity Prompt (Copy & Paste):
```text
Task: Implement Phase 2 — Install the real @retab/schema-builder component in Next.js, build the high-level SchemaEditorPanel workbench wrapper, and implement the complete Schema Management CRUD API in FastAPI with MongoDB and Draft-07 validation.

Context & Grounding Rules:
- CRITICAL GROUNDING: Check `references.json`, `.reference/INDEX.md`, and inspect `.reference/repos/retab-ui` and `.reference/repos/retab-ui/public/r/schema-builder.json`. Do NOT hallucinate or vendor dummy schema builders from memory.
- All CLI commands must be non-interactive (`-y` / `--yes`).

Implementation Plan:

1. Backend Schema Models & Validation (`backend/app/models/schema.py`):
   - Define Pydantic models:
     - `SchemaCreate`: `name: str`, `description: Optional[str] = None`, `json_schema: dict`.
     - `SchemaUpdate`: `name: Optional[str] = None`, `description: Optional[str] = None`, `json_schema: Optional[dict] = None`.
     - `SchemaResponse`: `id: str`, `name: str`, `description: Optional[str] = None`, `json_schema: dict`, `created_at: datetime`, `updated_at: datetime`.
   - Strict Draft-07 validation:
     - Use `jsonschema.Draft7Validator.check_schema(schema)` and ensure `schema.get("type") == "object"`.
     - Raise HTTP 400 with a clear message if the schema is not valid Draft-07 or root is not an object.

2. Backend Database Layer & Seeding (`backend/app/database.py`):
   - Add a dependency function `get_schemas_collection()` returning `app_db["schemas"]` (allowing easy FastAPI dependency override in tests).
   - In `init_databases()` / lifespan:
     - Check if `app_db["schemas"]` is empty.
     - If empty, seed 2 default templates with timestamps:
       1. "Commercial Invoice" (matching `docs/Master Architecture spec.md` Section 5.1).
       2. "Clinical / Lab Report" (specimen collection date, patient_name, patient_id, ordering_physician, and test_results array with test_name, result_value, units, reference_range, flag).
     - Ensure seeding handles offline MongoDB gracefully (logs a warning, does not crash startup).

3. Backend Router (`backend/app/routers/schemas.py` & `backend/app/main.py`):
   - Create router mounted at `/api/schemas`:
     - `POST /api/schemas`: Validates Draft-07 schema, stores document in MongoDB with UTC timestamps, returns 201 with `SchemaResponse`.
     - `GET /api/schemas`: Returns list of all schemas with `_id` mapped to `id: str`.
     - `GET /api/schemas/{schema_id}`: Validates BSON `ObjectId`, returns 404 if invalid/not found, else returns `SchemaResponse`.
     - `PUT /api/schemas/{schema_id}`: Partial update with Draft-07 re-validation if `json_schema` provided, updates `updated_at`, returns updated `SchemaResponse` or 404.
     - `DELETE /api/schemas/{schema_id}`: Deletes schema, returns 200 `{"status": "deleted", "id": schema_id}` or 404.
   - Register the router in `backend/app/main.py`.

4. Backend Automated Test Suite (`backend/tests/test_schemas.py`):
   - Write comprehensive async pytest tests using FastAPI TestClient / AsyncClient:
     - Test Draft-07 rejection of invalid schemas (returns 400).
     - Test full CRUD lifecycle (`POST` -> `GET` -> `GET {id}` -> `PUT` -> `DELETE`).
     - Test 404 behavior for invalid or non-existent IDs.
     - Mock MongoDB collection using `app.dependency_overrides[get_schemas_collection]` so tests run fast and isolated without requiring a live MongoDB instance.

5. Frontend Dependencies & Retab Installation (`frontend/`):
   - Run in `frontend/`:
     - `npx shadcn@latest add "https://ui.retab.com/r/schema-builder.json" -y`
     - `npx shadcn@latest add button accordion -y` (installs required peer UI components imported by Retab)
     - `npm install ajv ajv-errors ajv-formats sonner react-hook-form @hookform/resolvers`
   - Check `frontend/package.json` and ensure `@radix-ui/react-accordion`, `@radix-ui/react-dropdown-menu`, etc. are present and resolve properly.

6. Frontend API Client (`frontend/src/lib/api-client.ts`):
   - Add schema API functions:
     - `fetchSchemas(): Promise<SchemaResponse[]>`
     - `fetchSchemaById(id: string): Promise<SchemaResponse>`
     - `createSchema(payload: SchemaCreate): Promise<SchemaResponse>`
     - `updateSchema(id: string, payload: SchemaUpdate): Promise<SchemaResponse>`
     - `deleteSchema(id: string): Promise<void>`

7. Schema Editor Panel Component (`frontend/src/components/retab/schema-editor-panel.tsx`):
   - Controlled wrapper around Retab's `SchemaBuilder` with `features={{ jsonMode: true, definitions: true }}`.
   - Add top toolbar:
     - **Template Selector**: Dropdown to select and load templates from `GET /api/schemas`.
     - **Save / Update Dialog**: Modal dialog prompting for Schema Name & Description; if an existing schema is active, offers "Update Current Schema" (`PUT`) or "Save as New Copy" (`POST`).
     - **View Switcher Toggle**: Controls `view="fields" | "json"` for toggling between the visual tree editor and raw JSON editor.
     - **New Schema Button**: Resets editor to a blank root object `{ type: "object", properties: {}, required: [] }`.
   - Include `Toaster` from `sonner` for instant visual toast feedback on save/update/error.

8. Workbench Page Integration (`frontend/src/app/page.tsx`):
   - Replace the starter placeholder in `page.tsx` with the mounted `SchemaEditorPanel`.

Verification Checklist:
- Run `.venv/bin/pytest backend/tests` -> All health and schema tests pass (100% green).
- Run `npm run build` in `frontend/` -> Next.js 14 compiles with 0 TypeScript/ESLint errors.
- Test `GET http://localhost:8001/api/schemas` -> Seeded templates returned when MongoDB is up.
```

---

## Phase 3: Lift-Powered Document Preprocessing & LiteLLM Vision Extraction Pipeline

### 📋 Antigravity Prompt (Copy & Paste):
```text
Task: Implement the production document ingestion, non-blocking background page-rendering pipeline, OpenAI strict schema normalizer, and async LiteLLM Vision extraction engine with 3-page threshold routing, bounded concurrency, accumulated token tracking, seam-only multi-page merging guided by original Draft-07 schema, and real-time multi-subscriber SSE progress streaming with TTL cache cleanup.

Context & Architectural Decisions (Strictly Enforced):
- GROUNDING & DEPENDENCIES:
  - Add `lift-pdf>=0.1.2` as an official project dependency in `backend/requirements.txt` and `backend/pyproject.toml` (do not install `lift-pdf[hf]`). Application code resolves standard imports from virtual environment packages, failing fast with `ImportError` if missing.
  - Reusable primitives:
    - From `lift.model.util`: `scale_to_fit` (grid/aspect-ratio scaling to max 1088x1408 on 28px patch boundaries to prevent vision token explosions) and `detect_repeat_token` (loop detection).
    - From `lift.prompts`: `DIRECT_EXTRACTION_PROMPT`.
    - From `pypdfium2` / `pdfium_c`: `FPDFPage_Flatten` for form/annotation flattening (with `doc.init_forms()` called prior to flattening).
    - For schema validation: use `jsonschema.Draft7Validator.check_schema(schema)` (avoiding dynamic runtime Pydantic class generation).
  - Replaced inference layer: Strictly DO NOT use `lift.extract()`, `lift.extract_images()`, or `lift.model.vllm` (they use sync blocking `ThreadPoolExecutor` and hardcoded `localhost:8000/v1` vLLM). All generation is dispatched asynchronously via `await litellm.acompletion` targeting our custom endpoint (`LLM_API_BASE`, `LLM_API_KEY`, `LLM_MODEL`).
  - Pure LiteLLM & Strict Mode: Pass Draft-07 JSON schemas directly to LiteLLM via OpenAI strict structured outputs (`response_format={"type": "json_schema", "json_schema": {"name": "document_extraction", "schema": strict_schema, "strict": True}}`).
  - Schema Lifecycle: Save the original user Draft-07 schema in `app_db.jobs` and pass it to the multi-page merger. Normalize to strict structured outputs on-the-fly for the LiteLLM request.

Requirements:

1. Database & Request Models (`backend/app/models/document.py` & `backend/app/models/job.py`):
   - Uniform ObjectId Primary Keys: Use standard 24-character hexadecimal `ObjectId` strings for all `id` fields (`default_factory=lambda: str(ObjectId())`), matching Phase 2 schemas.
   - Document Models (`app_db.documents`):
     - `DocumentMetadata`: `id` (24-char hex ObjectId), `filename` (str), `content_type` (str), `file_size` (int), `file_path` (str), `page_count` (int), `rendered_pages` (list[int]), `render_status` (`"pending"` | `"rendering"` | `"completed"` | `"failed"`), `error_message` (Optional[str]), `created_at` (datetime), `updated_at` (datetime).
     - `DocumentResponse`: API response schema with `id` mapped from `_id`/`id`.
   - Extraction Job Models (`app_db.jobs`):
     - `ExtractStartRequest`: `document_id` (24-char hex ObjectId), `schema_id` (Optional[str]), `json_schema` (Optional[dict]), `page_range` (Optional[str], 0-indexed e.g. "0-2,5").
     - `TokenUsage`: `prompt_tokens` (int), `completion_tokens` (int), `total_tokens` (int).
     - `ExtractionJob`: `id` (24-char hex ObjectId), `document_id` (str), `schema_id` (Optional[str]), `schema_name` (Optional[str]), `json_schema` (dict, original user schema), `page_range` (Optional[str]), `status` (`"pending"` | `"waiting_for_render"` | `"extracting"` | `"merging"` | `"completed"` | `"partial_success"` | `"failed"`), `failed_pages` (list[int]), `progress` (float 0.0-1.0), `raw_extraction` (Optional[dict]), `error_message` (Optional[str]), `model_used` (str), `token_usage` (TokenUsage), `duration_seconds` (Optional[float]), `created_at` (datetime), `completed_at` (Optional[datetime]), `harmonized` (bool = False), `harmonized_target_collection` (Optional[str] = None).
     - `ExtractionJobResponse`: API response schema.

2. Document Ingestion, Background Rendering & Serving (`backend/app/services/pdf_service.py` & `backend/app/routers/documents.py`):
   - Guardrails: Max file size 50 MB (stream-checked in 1MB chunks to prevent memory bloat; abort with HTTP 413 if exceeded), allowed MIME types (`application/pdf`, `image/png`, `image/jpeg`, `image/webp`, `image/tiff` verified via `filetype.guess`), max 20 pages per document. Reject invalid inputs with HTTP 400.
   - Path Traversal Guard: Verify `os.path.commonpath([resolved_path, upload_dir_abs]) == upload_dir_abs` and validate ObjectId format on file serving.
   - Non-Blocking Incremental Background Rendering (Async Orchestrator):
     - Saves uploaded file to `{UPLOAD_DIR}/{doc_id}/document.{ext}`.
     - For PDFs, counts pages using `pypdfium2.PdfDocument(filepath)`; for images, `page_count = 1`.
     - Inserts record into `app_db.documents` (`_id=ObjectId(doc_id)`, `render_status="rendering"`, `rendered_pages=[]`).
     - Returns `201 Created` immediately with document metadata.
     - Background async orchestrator worker:
       - For images: opens with Pillow, converts to RGB, saves atomically to `{UPLOAD_DIR}/{doc_id}/page_0.png`.
       - For PDFs: iterates page by page; delegates CPU/disk rendering of each page to `await asyncio.to_thread(_render_page_to_disk_sync, filepath, i, out_path)`:
         - Calls `doc.init_forms()` before flattening to preserve interactive form data.
         - Calls `pdfium_c.FPDFPage_Flatten(page, pdfium_c.FLAT_NORMALDISPLAY)`, re-retrieves page handle, renders at 150 DPI.
         - Writes to `{UPLOAD_DIR}/{doc_id}/page_{i}.png.tmp` and atomically renames to `page_{i}.png` via `os.replace`.
       - Updates `app_db.documents` on the main loop via `await col.update_one(...)` pushing `i` into `rendered_pages`.
       - Signals in-memory page event notifier (`page_render_notifier.notify(doc_id, i)`).
       - Sets `render_status="completed"` on success, or `render_status="failed"` on error.
   - Page Synchronization Barrier (`ensure_pages_rendered(doc_id, required_pages, timeout=45.0)`):
     - Validates page bounds ($0 \le p < \text{page\_count}$).
     - Checks disk; if still rendering, awaits in-memory page notifier events (with 100ms polling fallback).
     - Fails fast immediately if `render_status == "failed"`.
   - Endpoints in `backend/app/routers/documents.py`:
     - `POST /api/documents/upload`: Uploads document, starts background rendering, returns metadata immediately.
     - `GET /api/documents/{doc_id}/file`: Streams original file via `FileResponse`.
     - `GET /api/documents/{doc_id}/pages/{page_number}`: Ensures `page_number` is rendered via `ensure_pages_rendered`, then serves PNG via `FileResponse`.
     - `GET /api/documents/{doc_id}`: Returns document metadata and rendering status.

3. Strict Schema Normalizer & LiteLLM Extraction Service (`backend/app/services/litellm_service.py`):
   - `normalize_schema_for_strict_mode(schema: dict) -> dict`:
     - Validates Draft-07 specification via `jsonschema.Draft7Validator.check_schema`.
     - Deepcopies schema before modification to avoid in-place mutation.
     - Strict Constraint Check: Recursively inspects schema for strict-incompatible constraints (`pattern`, `minimum`, `maximum`, `minLength`, `maxLength`, `minItems`, `maxItems`, `uniqueItems`, `multipleOf`). If found, raises HTTP 400.
     - Unpacks existing type arrays (e.g. `type: ["string", "null"]`) into scalar `type: "string"` before wrapping into `anyOf`.
     - Strips metadata keywords (`$schema`, `default`, `title`, `id`, `$id`).
     - Preserves `"format"` by appending a hint to property `"description"`, then strips `"format"`.
     - Recursive Strict Transformation:
       - Every `object` node: sets `"additionalProperties": False`, sets `"required": sorted(list(properties.keys()))`.
       - Every property: wrapped in nullable union `{"anyOf": [original_type, {"type": "null"}]}`.
   - Vision Payload Assembly:
     - Applies `lift.model.util.scale_to_fit(img, max_size=(1088, 1408), grid_size=28)` before base64 encoding on-demand.
   - Prompting & Semantic Inference for Implicit Keys:
     - Directs VLM to use schema field `description` annotations to semantically map implicit table columns or double-entry fields (Debits/Credits, Assets/Liabilities).
     - Returns `null` for absent scalars and `[]` for absent lists.
   - 3-Page Threshold Concurrency Engine:
     - If `len(pages) <= 3`:
       - Single multi-modal LiteLLM call with all pages attached. Returns complete extracted object directly (no multi-page merger step).
       - Temperature: `0.0`. Loop detection (`detect_repeat_token`) and `json.JSONDecodeError` trigger retry with `temperature=0.3`.
       - If call fails after all retries, all requested pages are added to `failed_pages` and status is set to `"failed"`.
     - If `len(pages) > 3`:
       - Throttled per-page concurrent execution using `asyncio.Semaphore(5)`.
       - Up to 3 retries with exponential backoff on 429 or transient timeouts.
       - Each page prompt instructs: *"You are analyzing Page {i+1} of {total_pages}. Extract ONLY fields visible on this page. Return null for fields not present and [] for empty lists."*
       - Loop detection and JSON decode errors trigger retry with `temperature=0.3`.
       - Accumulates `token_usage` (`prompt_tokens`, `completion_tokens`, `total_tokens`) across all page responses (handling null usage objects safely).
     - Resilient Partial Aggregation:
       - If a single page fails after all retries, logs error and records page in `failed_pages`.
       - If `0 < len(failed_pages) < total_pages`, sets job status to `"partial_success"` with extracted data from successful pages.
       - If `len(failed_pages) == total_pages`, sets job status to `"failed"`.
   - Null-Safe Deterministic Schema-Guided JSON Merger (`merge_page_extractions(page_results: list[dict], schema: dict) -> dict`):
     - Uses original user Draft-07 schema for property type resolution plus runtime `isinstance` checks.
     - Arrays (e.g. `line_items`): null-coalesced (`p.get(key) if isinstance(...) else []`), concatenated in ascending page order.
     - Seam-Only Deduplication: Deduplicates identical items ONLY across page boundaries (comparing last item of page $k$ with first item of page $k+1$), preserving legitimate identical rows on the same page.
     - Scalars: takes first valid non-null, non-empty, non-container value (`val is not None and val != "" and not isinstance(val, (list, dict))`), strictly preserving `0`, `0.0`, and `False`.
     - Nested Objects: recursively merged with null-coalescing.

4. Extraction Job Management & Real-Time SSE Stream (`backend/app/routers/extract.py`):
   - Multi-Subscriber Event Broker (`JobEventBroker`):
     - Maintains isolated `asyncio.Queue` sets per job ID (`_subscribers: dict[str, set[asyncio.Queue]]`).
     - Iterates over `list(self._subscribers.get(job_id, set()))` in `publish` to prevent `RuntimeError: Set changed size during iteration`.
     - Caches latest event snapshot with an automated LRU / 10-minute TTL cleanup mechanism to prevent memory leaks while supporting client reconnects.
   - `POST /api/extract/start`:
     - Accepts `ExtractStartRequest` (`document_id`, `schema_id`, `json_schema`, `page_range`).
     - Validates `document_id` exists in `app_db.documents`.
     - Strict Page Range Validation: defaults None/empty to all pages `list(range(doc.page_count))`; strictly validates syntax and bounds ($0 \le p < \text{doc.page\_count}$), raising HTTP 400 on error.
     - If `schema_id` is supplied, fetches schema from `app_db.schemas` via `parse_object_id(schema_id)` (raises 404 if missing).
     - Validates schema, rejects unsupported constraints (`pattern`, `minimum`, etc.) with HTTP 400.
     - Creates job in `app_db.jobs` (`_id=ObjectId(job_id)`, `status="pending"`, storing original schema).
     - Spawns background extraction task held in module-level `_background_tasks: set[asyncio.Task]` with done callback to avoid GC.
     - Returns `200 OK` `{job_id, status: "pending"}`.
   - Background Extraction Worker Lifecycle:
     - Emits granular events via `JobEventBroker.publish` and updates `app_db.jobs`:
       1. `waiting_for_render`: ensures required page images are rendered.
       2. `extracting`: emits `{"status": "extracting", "completed_pages": y, "total_pages": n, "progress": float}`.
       3. `merging`: emits `{"status": "merging"}`.
       4. `completed` / `partial_success`: emits final `raw_extraction`, token usage, execution time.
       5. `failed`: emits sanitized client-friendly error message.
   - `GET /api/extract/stream/{job_id}`:
     - Validates `job_id` exists in `app_db.jobs` (raises 404 if not found).
     - If job is already terminal in DB, immediately emits terminal event and closes.
     - Otherwise subscribes to `JobEventBroker`, emits latest state snapshot, streams SSE events (`sse-starlette.EventSourceResponse`), handling disconnect cleanly in `finally`.
   - `GET /api/extract/status/{job_id}`: Resilient DB fallback polling endpoint returning complete job state from MongoDB.
   - `GET /api/extract/jobs`: Returns sorted list of extraction jobs for History view (`created_at` desc).

Verification:
- Run automated unit and integration tests:
  1. `test_strict_schema_normalizer`: Verifies deepcopy isolation, type array unpacking (`type: [t, "null"]` -> `t`), `$schema` stripping, `additionalProperties: False`, `required: all`, universal `anyOf` nullability, `format` description preservation, and strict HTTP 400 rejection of schemas with `pattern`/`minimum`.
  2. `test_pdf_service`: Tests chunked 50MB upload guardrail, path traversal protection, async background orchestrator with `doc.init_forms()` and `FPDFPage_Flatten`, atomic file write, `ensure_pages_rendered` in-memory event notifier, and image serving endpoint.
  3. `test_json_merger`: Verifies original-schema property type resolution, seam-only array deduplication, scalar priority preserving 0/False while ignoring empty containers, recursive object merging, and partial page failure handling.
  4. `test_litellm_service`: Tests mocked LiteLLM extraction for <= 3 pages single call (direct return without merge) and > 3 pages parallel semaphore execution with token accumulation and loop retry.
  5. `test_extract_router`: Tests job creation with ObjectId primary keys, `schema_id` lookup via `ObjectId`, page range syntax/bounds validation (HTTP 400), `JobEventBroker` safe iteration and 10-minute TTL cleanup, SSE stream, status fallback, and job listing.
```

---

## Phase 4: Dual-Pane Extraction Studio & History Dashboard

### 📋 Antigravity Prompt (Copy & Paste):
```text
Task: Build the Dual-Pane Extraction Studio and Extraction History Dashboard in Next.js.

Context:
- Inspect `.reference/repos/retab-ui` first to see available file/PDF viewer components or install `@retab` viewer primitives if available, falling back to a clean PDF object/canvas viewer backed by our `GET /api/documents/{doc_id}/file` and `/pages/{page_number}` endpoints.

Requirements:
1. Document Viewer Component (`frontend/src/components/retab/pdf-viewer.tsx`):
   - Supports drag-and-drop PDF upload (`POST /api/documents/upload`) when no document is loaded.
   - Displays the uploaded PDF with page navigation, zoom controls, and page thumbnails served from `/api/documents/{doc_id}/...`.

2. Dual-Pane Extraction Workbench (`frontend/src/app/page.tsx`):
   - Top Action Bar: Document uploader/selector, Schema template selector, LLM model indicator badge, and "Run Extraction" button.
   - Left Pane: `PdfViewer` displaying the active document.
   - Right Pane: `SchemaEditorPanel` (Visual Schema Builder + Raw JSON Schema code tab).
   - Results Drawer / Panel:
     - Connects to `GET /api/extract/stream/{job_id}` via `EventSource` to display live progress (`rendering_pages`, `calling_vlm`, `completed`).
     - Displays extracted structured JSON in both a collapsible JSON Tree view and a Tabular view (for arrays/records).
     - Includes a prominent "Harmonize with BDI-Kit →" button that routes to `/harmonize/{job_id}`.

3. Extraction History Page (`frontend/src/app/history/page.tsx`):
   - Fetches jobs from `GET /api/extract/jobs`.
   - Displays Document Name, Schema Name, Created Date, Page Count, Extraction Status, Harmonization Status badge, and actions ("Inspect JSON", "Open in Harmonizer").

Verification:
- Run `npm run build` in `frontend/` and verify all pages (`/`, `/history`) compile without TypeScript or ESLint errors.
```

---

## Phase 5: Data Harmonization Engine (`bdi-kit`) & Extensible Harmonizer UI

### 📋 Antigravity Prompt (Copy & Paste):
```text
Task: Implement the Data Harmonization Engine in FastAPI using NYU VIDA's `bdi-kit` (`bdikit`) library and create a modular, extensible Frontend Harmonization Studio shell.

Context:
- CRITICAL GROUNDING STEP: Before writing any code for this phase, inspect `.reference/repos/bdi-kit` (especially `bdikit/api.py`) and `.reference/docs/bdi-kit-docs/` using `view_file` and `grep_search`.
- Verify the exact signatures of `bdikit`:
  - `import bdikit as bdi`
  - `bdi.match_schema(source, target, method=...)`
  - `bdi.rank_schema_matches(source, target, attributes=..., top_k=10, method=...)`
  - `bdi.match_values(source, target, attribute_matches=..., method=...)`
  - `bdi.rank_value_matches(source, target, attribute_matches=..., top_k=10, method=...)`
  - `bdi.create_harmonization_spec(mappings=[{"source": ..., "target": ..., "mapper": ...}])`
  - `bdi.materialize_mapping(source, harmonization_spec)`
- How extracted JSON connects to `bdi-kit`:
  - `bdi-kit` operates on `pandas.DataFrame` objects.
  - When a user opens an extraction job in the Harmonizer, the backend converts the extracted JSON (either a top-level flat object, or a selected nested array of objects like `line_items`, or multiple extracted jobs sharing the same schema) into a `source_df: pd.DataFrame`.
  - The target can be either an existing collection in `TARGET_MONGODB_URI` (sampled into a `target_df: pd.DataFrame` or represented as a target schema DataFrame) or a user-defined target schema table.
- Note on Frontend UI: The user is still finalizing the custom visual design of the Harmonization interface. Build the frontend page (`frontend/src/app/harmonize/[id]/page.tsx`) using clean, decoupled sub-components inside `frontend/src/components/harmonizer/` with clear props and state hooks so the UI layout can be easily customized later without touching backend API calls.

Requirements:
1. Target DB Introspection & DataFrame Adapter (`backend/app/services/bdi_service.py`):
   - `json_extraction_to_dataframe(raw_extraction: dict, root_array_path: Optional[str] = None) -> pd.DataFrame`:
     - Converts extracted JSON into a Pandas DataFrame (if `root_array_path` is provided, e.g. `"line_items"`, extracts that list of records into rows while optionally flattening parent metadata fields; otherwise normalizes the dict via `pd.json_normalize`).
   - `target_collection_to_dataframe(collection_name: str, sample_size: int = 100) -> pd.DataFrame`:
     - Samples documents from `target_db[collection_name]` (excluding `_id` or converting `ObjectId` to str) into a target `pd.DataFrame`. If the target collection is empty, accepts a target column list/schema definition to construct an empty typed `pd.DataFrame`.
   - Wrappers around real `bdikit` primitives:
     - `run_schema_matching(source_df, target_df, method: str = "magneto_ft_bp", top_k: int = 5)`: Calls `bdi.match_schema()` and `bdi.rank_schema_matches()` to return recommended column mappings and similarity scores, with safe fallback to string/similarity matching if an LLM key or model weight is unavailable.
     - `run_value_matching(source_df, target_df, attribute_matches, method: str = "tfidf")`: Calls `bdi.match_values()` to propose value-level mappings (`source_value`, `target_value`, `similarity`).
     - `materialize_and_cast(source_df, harmonization_spec: list[dict], type_casts: dict)`:
       - Calls `bdi.create_harmonization_spec(harmonization_spec)` / `bdi.materialize_mapping(source_df, harmonization_spec)` to produce the harmonized DataFrame.
       - Applies optional post-harmonization BSON type casting for MongoDB insertion (`string`, `int`, `float` sanitizing currency symbols `$, €, £, ¥` and commas, `iso_date` -> `datetime.datetime`, `boolean`, `object_id` -> `bson.ObjectId`, and `constant` metadata injection).

2. Harmonization Router & Saved Profiles (`backend/app/routers/harmonize.py` & `backend/app/models/harmonization.py`):
   - `GET /api/harmonize/target/collections`: Lists collections in `target_db` (`TARGET_MONGODB_URI`) plus document counts and inferred fields.
   - `GET /api/harmonize/methods`: Returns available `bdi-kit` schema matching and value matching method names inspected from `bdikit`.
   - `POST /api/harmonize/match-schema`: Accepts `{job_id, root_array_path, target_collection, target_columns, method}` and returns `bdi-kit` schema match candidates with similarity scores + top-k alternatives.
   - `POST /api/harmonize/match-values`: Accepts confirmed attribute matches and runs `bdi.match_values()`, returning value alignment tables per matched attribute.
   - `POST /api/harmonize/preview`: Accepts `{job_id, root_array_path, harmonization_spec, type_casts}` -> runs `bdi.materialize_mapping()` + BSON type casting and returns a side-by-side preview of source rows vs. harmonized target documents.
   - `GET /api/harmonize/profiles` & `POST /api/harmonize/profiles`: Save and load reusable `bdi-kit` harmonization specifications in `app_db.harmonization_profiles`.
   - `POST /api/harmonize/commit`: Inserts the harmonized records into `target_db[target_collection]` (`insert_many` / `insert_one`) and updates `app_db.jobs` with `harmonized=True` and `harmonized_target_collection=target_collection`.

3. Modular Harmonizer Frontend Shell (`frontend/src/app/harmonize/[id]/page.tsx` & `frontend/src/components/harmonizer/`):
   - Create a clean, custom-hook-driven state layer (`useHarmonizationSession(jobId)`) separating API logic from presentation.
   - Build modular, replaceable UI panels in `frontend/src/components/harmonizer/`:
     - `TargetConfigBar.tsx`: Select target MongoDB collection (or define custom target columns), choose root JSON path (document root vs. array like `line_items`), and load/save a Harmonization Profile.
     - `SchemaMatchingPanel.tsx`: Triggers `POST /api/harmonize/match-schema`, displays `bdi-kit` `source_attribute -> target_attribute` rows with similarity score badges, top-k alternative dropdowns, and BSON type-cast selectors.
     - `ValueMatchingPanel.tsx`: Triggers `POST /api/harmonize/match-values` for selected columns, allowing human-in-the-loop editing of `source_value -> target_value` dictionaries (`mapper`).
     - `MaterializePreviewPanel.tsx`: Calls `POST /api/harmonize/preview` to show the materialized `bdi-kit` table/JSON diff and the "Commit to Enterprise MongoDB" button (`POST /api/harmonize/commit`).

Verification:
- Seed `target_db` (`localhost:27018`) with a sample target collection (`enterprise_invoices`) containing 3 sample records.
- Run a backend integration test that takes a sample extracted invoice JSON, runs `bdi.match_schema()` and `bdi.materialize_mapping()` against `enterprise_invoices`, previews the harmonized output, and commits it to `target_db`.
```

---

## Phase 6: Closed-Source Licensing Compliance, Docker Packaging & E2E Smoke Test

### 📋 Antigravity Prompt (Copy & Paste):
```text
Task: Generate commercial closed-source legal attribution files, create production Dockerfiles with proper container networking, and run an end-to-end pipeline verification script.

Context:
- Every dependency (`retab-ui` MIT, `litellm` MIT, `pypdfium2` Apache-2.0/BSD, `pymongo` Apache-2.0, `bdi-kit` Apache-2.0, `pandas` BSD-3-Clause, `FastAPI` MIT, `Next.js` MIT) uses a permissive license compatible with commercial closed-source distribution.
- Inside Docker Compose, the `backend` container must connect to `mongodb://mongo-app:27017/...` and `mongodb://mongo-target:27017/...` (using internal service names, whereas host scripts connect via `localhost:27017` and `localhost:27018`).

Requirements:
1. Legal & Attribution Compliance (`THIRD_PARTY_LICENSES.md`):
   - Generate `THIRD_PARTY_LICENSES.md` at the repository root listing all backend and frontend third-party packages, their permissive licenses (MIT, Apache-2.0, BSD), copyright notices (including `@retab/ui` and `VIDA-NYU/bdi-kit`), and the proprietary notice:
     "The application proprietary orchestration logic, harmonization workflows, and custom user interface code are Copyright (C) [Your Company]. All rights reserved. Commercial closed-source distribution."
   - Audit `requirements.txt` and `package.json` to ensure no GPL/AGPL packages were introduced.

2. Production Packaging (`backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`):
   - `backend/Dockerfile`: Python 3.12 slim image installing `requirements.txt` and running Uvicorn.
   - `frontend/Dockerfile`: Multi-stage Node 20 Alpine build accepting `ARG NEXT_PUBLIC_API_URL=http://localhost:8001/api` at build time.
   - Update `docker-compose.yml` so `backend` uses `APP_MONGODB_URI=mongodb://mongo-app:27017/extraction_app_db` and `TARGET_MONGODB_URI=mongodb://mongo-target:27017/company_enterprise_db`.

3. End-to-End Smoke Test (`scripts/test_pipeline.py`):
   - Write an automated verification script that:
     1. Verifies `/api/health` confirms both MongoDB instances are connected.
     2. Creates a test schema via `POST /api/schemas`.
     3. Generates a synthetic 1-page PDF using `pypdfium2` / `Pillow` and uploads it to `POST /api/documents/upload`.
     4. Seeds a target enterprise collection in `TARGET_MONGODB_URI` (`port 27018`).
     5. Executes `bdi-kit` schema matching (`POST /api/harmonize/match-schema`), value matching (`POST /api/harmonize/match-values`), preview materialization (`POST /api/harmonize/preview`), and commits the harmonized record (`POST /api/harmonize/commit`).
     6. Queries `TARGET_MONGODB_URI` directly to assert the harmonized document arrived in the target enterprise collection.

Verification:
- Run `python3 scripts/test_pipeline.py` and confirm all 6 stages pass end-to-end.
```