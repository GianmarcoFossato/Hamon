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
             "https://bdi-kit.readthedocs.io/stable/value-matching.html"
           ]
         },
         {
           "name": "retab-ui-docs",
           "url": "https://ui.retab.com/docs",
           "key_pages": [
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
   - Image/Dockerfile includes Python 3.11+ and Node.js 20 LTS, with VS Code extensions for Python, Pylance, Tailwind CSS, and ESLint.
   - Forwards ports 3000 (frontend), 8001 (backend), 27017 (`mongo-app`), and 27018 (`mongo-target`).

2. Backend Scaffolding (`backend/`):
   - Create `pyproject.toml` and `requirements.txt` with permissive-licensed packages:
     `fastapi>=0.115.0`, `uvicorn[standard]>=0.30.0`, `pydantic-settings>=2.4.0`, `pymongo>=4.10.0`, `pypdfium2>=4.30.0`, `pillow>=10.4.0`, `litellm>=1.50.0`, `bdi-kit>=0.11.0`, `pandas>=2.2.0`, `python-multipart>=0.0.9`, `httpx>=0.27.0`, `sse-starlette>=2.1.0`, `pytest>=8.3.0`, `pytest-asyncio>=0.24.0`.
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
Task: Inspect the cloned `retab-ui` repository in `.reference/repos/retab-ui`, install the real `@retab/schema-builder` component, and build the Schema Management CRUD API in FastAPI.

Context:
- CRITICAL GROUNDING STEP: First, inspect `.reference/repos/retab-ui` and `.reference/docs/retab-ui-docs/schema-builder.json` using `view_file` / `find_by_name` to see the exact file structure, dependencies (`ajv`, `ajv-errors`, `ajv-formats`, `sonner`, etc.), and exported TypeScript components of `retab-ui`'s schema builder. Do NOT guess or fabricate the schema builder from memory.

Requirements:
1. Backend Schema CRUD API (`backend/app/routers/schemas.py` & `backend/app/models/schema.py`):
   - Define Pydantic models:
     - `SchemaCreate`: `name: str`, `description: Optional[str] = None`, `json_schema: dict`.
     - `SchemaUpdate`: Partial update fields.
     - `SchemaResponse`: `id: str`, `name: str`, `description: Optional[str]`, `json_schema: dict`, `created_at: datetime`, `updated_at: datetime`.
   - Implement endpoints mounted at `/api/schemas`:
     - `POST /api/schemas`: Save a new schema to `app_db.schemas`.
     - `GET /api/schemas`: List all saved schemas.
     - `GET /api/schemas/{schema_id}`: Fetch a single schema by ID.
     - `PUT /api/schemas/{schema_id}`: Update an existing schema.
     - `DELETE /api/schemas/{schema_id}`: Delete a schema.
   - Seed 2 default templates on startup if `app_db.schemas` is empty ("Commercial Invoice" and "Clinical / Lab Report").

2. Frontend Retab Schema Builder (`frontend/`):
   - Install the official Retab schema builder non-interactively:
     `npx shadcn@latest add "https://ui.retab.com/r/schema-builder.json" -y`
   - Verify the generated files against `.reference/repos/retab-ui` and install any peer dependencies required for `npm run build` to succeed.
   - Create a high-level wrapper component `frontend/src/components/retab/schema-editor-panel.tsx` that imports the installed Retab `SchemaBuilder` component and adds a toolbar for:
     - "Load Template" selector (fetches from `GET /api/schemas`).
     - "Save / Update Schema" modal dialog (`POST` / `PUT /api/schemas`).
     - "Import / Export Raw JSON" toggle.

Verification:
- Verify `GET http://localhost:8001/api/schemas` returns the seeded default schemas.
- Run `npm run build` in `frontend/` to verify the real `@retab/schema-builder` and all its TypeScript types compile with zero errors.
```

---

## Phase 3: PDF Ingestion & LiteLLM Strict Extraction Pipeline

### 📋 Antigravity Prompt (Copy & Paste):
```text
Task: Implement the PDF upload & page-rendering service (`pypdfium2` + `Pillow`), document serving endpoints, and the async LiteLLM Vision extraction pipeline with OpenAI Strict Schema normalization and SSE status streaming.

Context:
- `pypdfium2`'s `page.render()` does NOT take a `dpi` keyword argument; it takes `scale = dpi / 72.0`, followed by `.to_pil()` (which requires `Pillow`).
- OpenAI / LiteLLM Structured Outputs with `"strict": True` will reject schemas with a `400 BadRequestError` unless every `object` node has `"additionalProperties": False` and lists all properties inside `"required"` (making optional properties nullable, e.g., `["string", "null"]`). We must normalize the user's JSON schema before sending it to `litellm.acompletion`.

Requirements:
1. PDF Service & Document Router (`backend/app/services/pdf_service.py` & `backend/app/routers/documents.py`):
   - `save_pdf(file: UploadFile) -> dict`: Saves uploaded PDF to `{UPLOAD_DIR}/{doc_id}/document.pdf`, counts pages via `pypdfium2.PdfDocument`, and inserts metadata into `app_db.documents`.
   - `render_pages_to_images(doc_id: str, dpi: int = 200) -> list[str]`: Renders each page using `bitmap = page.render(scale=dpi / 72.0)` and `bitmap.to_pil().save(...)` to `{UPLOAD_DIR}/{doc_id}/page_{i}.png`.
   - `encode_images_base64(image_paths: list[str]) -> list[str]`: Encodes PNGs to `data:image/png;base64,...` data URIs.
   - Implement `backend/app/routers/documents.py`:
     - `POST /api/documents/upload`: Uploads a PDF and returns `{document_id, filename, page_count}`.
     - `GET /api/documents/{doc_id}/file`: Streams the raw PDF (`FileResponse` with `application/pdf`) for the frontend PDF viewer.
     - `GET /api/documents/{doc_id}/pages/{page_number}`: Serves the rendered PNG image for a specific page.

2. LiteLLM Vision Service (`backend/app/services/litellm_service.py`):
   - Implement `normalize_schema_for_strict_mode(schema: dict) -> dict`: Recursively deep-copies the JSON Schema, sets `"additionalProperties": False` on every object, and ensures all keys in `"properties"` are listed in `"required"` (wrapping any previously non-required property's `"type"` into a nullable union `[original_type, "null"]`).
   - Implement `extract_from_images(base64_images: list[str], json_schema: dict) -> dict` using `await litellm.acompletion`:
     ```python
     strict_schema = normalize_schema_for_strict_mode(json_schema)
     response = await litellm.acompletion(
         model=settings.LLM_MODEL,
         api_base=settings.LLM_API_BASE,
         api_key=settings.LLM_API_KEY,
         messages=messages,
         response_format={
             "type": "json_schema",
             "json_schema": {
                 "name": "document_extraction",
                 "schema": strict_schema,
                 "strict": True
             }
         },
         temperature=0.0
     )
     ```

3. Async Extraction Job & SSE Router (`backend/app/routers/extract.py`):
   - `POST /api/extract/start`: Accepts `document_id` and `schema_id` (or inline `json_schema`). Creates a job record in `app_db.jobs` (`status="pending"`) and launches an async background task (`queued` -> `rendering_pages` -> `calling_vlm` -> `completed` / `failed`).
   - `GET /api/extract/jobs`: Lists all extraction jobs for the History view.
   - `GET /api/extract/status/{job_id}`: Returns full job document including `raw_extraction`.
   - `GET /api/extract/stream/{job_id}`: Streams real-time SSE status updates until completion or failure.

Verification:
- Write and run a test that uploads a sample PDF to `POST /api/documents/upload`, fetches `GET /api/documents/{doc_id}/file`, and verifies `normalize_schema_for_strict_mode()` properly transforms nested objects and optional fields.
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
  - `bdi.top_matches(source, target, columns=..., top_k=...)`
  - `bdi.match_values(source, target, attribute_matches=..., method=...)`
  - `bdi.create_harmonization_spec(value_matches)`
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
     - `run_schema_matching(source_df, target_df, method: str = "ct_learning", top_k: int = 5)`: Calls `bdi.match_schema()` and `bdi.top_matches()` to return recommended column mappings and similarity scores, with safe fallback to string/similarity matching if an LLM key or model weight is unavailable.
     - `run_value_matching(source_df, target_df, attribute_matches, method: str = "tfidf")`: Calls `bdi.match_values()` to propose value-level mappings (`source_value`, `target_value`, `similarity`).
     - `materialize_and_cast(source_df, harmonization_spec: list[dict], type_casts: dict)`:
       - Calls `bdi.create_harmonization_spec()` / `bdi.materialize_mapping(source_df, harmonization_spec)` to produce the harmonized DataFrame.
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
   - `backend/Dockerfile`: Python 3.11 slim image installing `requirements.txt` and running Uvicorn.
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