# Antigravity Step-by-Step Execution Plan

This document contains the step-by-step instructions to paste into Antigravity to build out the entire PDF Extraction & Harmonization platform.

---

## How to Execute with Antigravity

> [!TIP]
> Execute one phase at a time. Each phase builds upon the previous one and includes a dedicated **Verification Step**. Once Antigravity completes a phase and the verification passes, proceed to the next phase.

---

## Phase 1: Monorepo Scaffolding & Environment Setup

### 📋 Antigravity Prompt (Copy & Paste):
```text
Task: Initialize the monorepo structure for the PDF Extraction & Data Harmonization Platform.

Context:
- We are building a modern monorepo with Next.js (TypeScript) in `frontend/` and FastAPI (Python 3.11+) in `backend/`.
- Dual MongoDB instances: APP_MONGODB_URI (internal app database) and TARGET_MONGODB_URI (target enterprise database).
- Code will be commercial closed-source. Only permissive MIT, Apache-2.0, or BSD libraries may be used.

Requirements:
1. Root Setup:
   - Create a root `.gitignore` covering Node, Python, virtual environments, .env files, and `./backend/data/uploads/`.
   - Create `.env.example` with:
     ```env
     # Internal Application Database
     APP_MONGODB_URI=mongodb://localhost:27017/extraction_app_db
     
     # Target Enterprise Database (Read/Write for harmonization)
     TARGET_MONGODB_URI=mongodb://localhost:27017/company_enterprise_db
     
     # LLM Provider Configuration
     LLM_API_BASE=https://api.openai.com/v1
     LLM_API_KEY=your_api_key_here
     LLM_MODEL=openai/gpt-4o
     
     # Backend Service
     BACKEND_PORT=8000
     UPLOAD_DIR=./data/uploads
     
     # Frontend Service
     NEXT_PUBLIC_API_URL=http://localhost:8000/api
     ```
   - Create `docker-compose.yml` defining:
     - `mongo-app`: MongoDB container for internal app data (port 27017).
     - `mongo-target`: MongoDB container simulating the company target database (port 27018 mapped to 27017 internally).

2. Backend Scaffolding (`backend/`):
   - Create `pyproject.toml` and `requirements.txt` containing:
     `fastapi>=0.110.0`, `uvicorn[standard]>=0.28.0`, `pydantic-settings>=2.2.0`, `pymongo>=4.6.0`, `motor>=3.3.0`, `pypdfium2>=4.28.0`, `litellm>=1.35.0`, `python-multipart>=0.0.9`, `httpx>=0.27.0`.
   - Setup `app/config.py` using `pydantic-settings` to load all `.env` variables with defaults.
   - Setup `app/database.py` initializing async Motor clients for both `app_db` and `target_db`, with healthcheck functions.
   - Setup `app/main.py` with FastAPI, CORS middleware enabled for frontend localhost ports (3000, 3001), healthcheck routes (`/api/health`), and dynamic router mounting.

3. Frontend Scaffolding (`frontend/`):
   - Initialize Next.js 14+ with TypeScript, Tailwind CSS, ESLint, and App Router.
   - Install core UI packages: `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`.
   - Initialize shadcn/ui configuration (`components.json`) with slate or neutral theme.
   - Setup `src/lib/api-client.ts` configured to point to `NEXT_PUBLIC_API_URL`.

Verification:
- Run backend healthcheck test to ensure both MongoDB client connections instantiate correctly.
- Verify Next.js compiles with `npm run build` or development server starts cleanly.
```

---

## Phase 2: Retab UI Integration & Schema Management

### 📋 Antigravity Prompt (Copy & Paste):
```text
Task: Integrate the @retab/schema-builder UI components and implement the Schema Management API in FastAPI with MongoDB persistence.

Context:
- Retab UI provides shadcn-compatible React components for JSON Schema building (`@retab/schema-builder`).
- Schemas dictate how the VLM extracts structured data from PDFs.
- Schemas must be created, edited, saved, listed, and loaded from internal MongoDB (`schemas` collection).

Requirements:
1. Backend Schema API (`backend/app/routers/schemas.py`):
   - Define Pydantic models in `backend/app/models/schema.py`:
     - `SchemaCreate`: `name: str`, `description: Optional[str]`, `json_schema: dict`.
     - `SchemaUpdate`: Partial update model.
     - `SchemaResponse`: Includes `id: str`, timestamps, name, description, and `json_schema`.
   - Implement CRUD endpoints under `/api/schemas`:
     - `POST /api/schemas`: Save a new schema to `app_db.schemas`.
     - `GET /api/schemas`: List all saved schemas (id, name, description, updated_at).
     - `GET /api/schemas/{schema_id}`: Fetch full schema definition by ID.
     - `PUT /api/schemas/{schema_id}`: Update existing schema.
     - `DELETE /api/schemas/{schema_id}`: Delete schema.
   - Seed default sample schemas (e.g., "Commercial Invoice", "Receipt", "W-2 Tax Form") if the collection is empty.

2. Frontend Retab Schema Builder Component (`frontend/src/components/retab/schema-builder.tsx`):
   - Install or vendor `@retab/schema-builder` (from shadcn registry `npx shadcn@latest add @retab/schema-builder` or vendor the headless component from retab-ui).
   - Create a high-level wrapper component `RetabSchemaEditor` that takes `value: JSONSchema` and `onChange: (newSchema: JSONSchema) => void`.
   - Add top-level controls:
     - "Save Schema" button (opens dialog to name/describe and persist to FastAPI).
     - "Load Template" dropdown / dialog (fetches list from `GET /api/schemas` and populates builder).
     - "Export JSON" and "Import Raw JSON" buttons.

Verification:
- Verify creating and updating a schema via the UI persists to MongoDB `schemas` collection.
- Test loading a previously saved schema back into the Retab editor.
```

---

## Phase 3: PDF Ingestion & LiteLLM Async Extraction Pipeline

### 📋 Antigravity Prompt (Copy & Paste):
```text
Task: Implement the PDF page rendering engine (pypdfium2) and the async LiteLLM Vision extraction pipeline with Server-Sent Events (SSE) status streaming.

Context:
- Users upload multi-page PDFs.
- We convert PDF pages to high-res PNG images using `pypdfium2` (pure Python wheel, no system poppler dependency).
- We use `litellm.completion` with the user's custom `LLM_API_BASE` and `LLM_API_KEY` to send images + Retab JSON Schema using OpenAI-compatible Structured Outputs (`response_format={"type": "json_schema", ...}`).

Requirements:
1. PDF Rendering Service (`backend/app/services/pdf_service.py`):
   - `save_pdf(file: UploadFile) -> DocumentMetadata`: Saves raw PDF to `./data/uploads/{doc_id}.pdf`.
   - `render_pages_to_images(doc_id: str, dpi: int = 200) -> List[str]`: Converts all pages to PNGs in `./data/uploads/{doc_id}/page_{i}.png` and returns file paths.
   - `encode_images_base64(image_paths: List[str]) -> List[str]`: Generates data URIs (`data:image/png;base64,...`) for VLM ingestion.

2. LiteLLM Extraction Service (`backend/app/services/litellm_service.py`):
   - Build a multimodal prompt:
     - User message contains text instructions: "Extract the data from this document strictly following the provided JSON schema."
     - Followed by the list of image objects: `[{"type": "image_url", "image_url": {"url": data_uri}} for data_uri in base64_images]`.
   - Call `litellm.completion`:
     ```python
     response = await litellm.acompletion(
         model=settings.LLM_MODEL,
         api_base=settings.LLM_API_BASE,
         api_key=settings.LLM_API_KEY,
         messages=messages,
         response_format={
             "type": "json_schema",
             "json_schema": {
                 "name": "document_extraction",
                 "schema": json_schema_dict,
                 "strict": True
             }
         },
         temperature=0.0
     )
     ```
   - Parse and return the extracted JSON payload.

3. Async Job Queue & SSE Router (`backend/app/routers/extract.py`):
   - Endpoints:
     - `POST /api/documents/upload`: Uploads PDF, saves it, extracts page count, creates a document record.
     - `POST /api/extract/start`: Accepts `document_id` and `schema_id` (or inline schema). Creates an extraction job in `app_db.jobs` with status `pending`. Spawns background worker.
     - `GET /api/extract/status/{job_id}`: Polling endpoint returning job status, progress percentage, and extracted data.
     - `GET /api/extract/stream/{job_id}`: SSE endpoint streaming live progress (`queued` -> `rendering_pages` -> `calling_vlm` -> `completed` / `failed`).

Verification:
- Upload a sample 2-page invoice PDF.
- Trigger extraction with a test invoice schema.
- Confirm LiteLLM executes against the LLM provider URL and saves valid structured JSON in `app_db.jobs`.
```

---

## Phase 4: Extraction Studio & UX Integration

### 📋 Antigravity Prompt (Copy & Paste):
```text
Task: Build the Datalab-style Dual-Pane Extraction Studio and History Dashboard in the Next.js frontend.

Context:
- We need the exact fluid UX of Datalab's playground: PDF Viewer on the left, Retab Schema Builder on the right, action bar with Run Extraction, and real-time results display.
- Also include an Extraction History page to view previously processed documents.

Requirements:
1. Document Viewer Component (`frontend/src/components/retab/pdf-viewer.tsx`):
   - PDF canvas preview with zoom in/out, page thumbnails sidebar, and current page navigation.
   - Drag-and-drop file upload zone when no document is currently loaded.

2. Dual-Pane Studio Page (`frontend/src/app/page.tsx`):
   - Top Bar: Document selector/uploader, Schema template selector, Provider status badge, and primary "Extract Data" button.
   - Left Pane: Interactive PDF viewer displaying uploaded document.
   - Right Pane: Retab Schema Builder tabs:
     - Tab 1: "Visual Builder" (interactive property tree).
     - Tab 2: "Schema Code" (monaco/code view of raw JSON schema).
   - Bottom / Slide-over Results Panel:
     - Live progress bar when extraction job is active (tracking SSE events).
     - Upon completion: displays Extracted Data in interactive JSON Tree View and dynamic Table View.
     - "Proceed to Harmonize" button linking directly to the harmonization studio with `job_id`.

3. Extraction History Page (`frontend/src/app/history/page.tsx`):
   - Table of all processed documents from `app_db.jobs`:
     - Columns: Document Name, Schema Used, Date, Page Count, Status, Harmonized Status, Actions.
     - Actions: "View Extracted JSON", "Re-run Extraction", "Open in Harmonizer".

Verification:
- Test uploading a PDF, adjusting schema in the builder, clicking "Extract Data", watching real-time SSE progress, and inspecting the resulting JSON tree.
```

---

## Phase 5: Data Harmonization Engine & Target DB Dispatch

### 📋 Antigravity Prompt (Copy & Paste):
```text
Task: Implement the Data Harmonization Engine (FastAPI) and Interactive Visual Field Mapper (Next.js) to transform and commit extracted data to the target enterprise MongoDB.

Context:
- Raw extracted JSON needs to be mapped to the target enterprise MongoDB (TARGET_MONGODB_URI).
- The enterprise DB is completely independent and has existing collections with specific schemas and data types.
- The user requires a visual mapping interface with type casting, date normalization, preview, and atomic commit.

Requirements:
1. Target DB Introspection API (`backend/app/routers/harmonize.py`):
   - `GET /api/harmonize/target/collections`: Lists collections in the target enterprise MongoDB.
   - `GET /api/harmonize/target/schema/{collection_name}`: Inspects recent documents in the target collection to discover field names and inferred BSON data types.

2. Harmonization Engine Service (`backend/app/services/mapper_service.py`):
   - Executes field mapping and transformation rules:
     - Field navigation: Dot-notation support (`vendor.address.zip`).
     - Type transforms:
       - `string`: Strips whitespace and casts to string.
       - `int`: Converts numeric string/float to integer.
       - `float`: Converts to float (sanitizes currency symbols like $, €, commas).
       - `iso_date`: Parses various date formats into BSON `datetime.datetime`.
       - `boolean`: Casts truthy/falsy values.
       - `object_id`: Converts 24-hex string to BSON `ObjectId`.
       - `constant`: Inserts fixed enterprise constants (e.g. `imported_by: "PDF_STUDIO"`).
   - `POST /api/harmonize/preview`: Takes raw JSON + mapping rules -> returns transformed document alongside schema diff.
   - `POST /api/harmonize/commit`: Validates and inserts/upserts the transformed document into the target enterprise MongoDB collection. Updates `app_db.jobs` marking `harmonized=true`.

3. Visual Field Mapper UI (`frontend/src/app/harmonize/[id]/page.tsx`):
   - Target collection selector dropdown (fetched from target DB).
   - Two-column visual mapping interface:
     - Left column: Extracted fields from raw JSON.
     - Right column: Target collection fields + Transform selector dropdown (String, Number, Date, ObjectId, etc.).
   - Interactive Live Preview modal: shows side-by-side comparison of raw extraction vs final enterprise BSON/JSON.
   - "Commit to Enterprise DB" button with confirmation alert.

Verification:
- Take an extracted invoice, map `invoice_date` to BSON Date and `total_amount` to float.
- Preview the transformed document.
- Click "Commit" and verify the record is properly inserted into `TARGET_MONGODB_URI` under the selected enterprise collection.
```

---

## Phase 6: Closed-Source Licensing Compliance, Packaging & Verification

### 📋 Antigravity Prompt (Copy & Paste):
```text
Task: Finalize commercial closed-source licensing compliance, generate legal attribution files, assemble production configurations, and run an end-to-end integration test.

Context:
- The product will be sold commercially closed-source.
- Upstream licenses (MIT for retab-ui & litellm, Apache-2.0 for pypdfium2 & pymongo) require preserving license texts and copyright notices without requiring our proprietary source code to be disclosed.

Requirements:
1. Legal & Attribution Compliance:
   - Create `THIRD_PARTY_LICENSES.md` at root documenting:
     - All third-party packages, licenses (MIT, Apache 2.0, BSD), and copyright notices.
     - Clear proprietary statement: "The application proprietary orchestration logic, harmonization engine, and custom user interface code are Copyright (C) [Your Company]. All rights reserved. Commercial closed-source distribution."
   - Ensure no GPL / AGPL dependencies exist in `package.json` or `requirements.txt`.

2. Production Packaging:
   - Create production Dockerfiles:
     - `backend/Dockerfile`: Multi-stage Python 3.11 slim image.
     - `frontend/Dockerfile`: Multi-stage Node 20 alpine image with standalone Next.js output.
   - Update root `docker-compose.yml` to support full-stack deployment (`frontend`, `backend`, `mongo-app`, `mongo-target`).
   - Create automated healthcheck and smoke-test script `scripts/test_pipeline.py`.

3. End-to-End Smoke Test:
   - Run the smoke test:
     1. Creates a sample schema.
     2. Simulates document upload.
     3. Calls extraction mock / LiteLLM test endpoint.
     4. Executes harmonization mapping.
     5. Verifies data arrival in target enterprise MongoDB collection.

Verification:
- Confirm `THIRD_PARTY_LICENSES.md` is present and accurate.
- Confirm all services build and start with `docker compose up --build`.
- Run `python scripts/test_pipeline.py` and confirm all pipeline stages pass.
```
