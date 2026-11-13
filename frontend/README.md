# Hamon Frontend: Next.js Studio & Harmonization Workbench

The visual frontend for the Hamon platform, built on **Next.js 14 LTS (App Router)**, **React 18**, **Tailwind CSS**, and **TypeScript**. It provides a dual-pane document extraction studio, an extraction history dashboard, and an interactive data harmonization workbench.

---

## 🏛️ Application Architecture & Page Routes

| Route | Page Component | Description |
| :--- | :--- | :--- |
| `/` | `src/app/page.tsx` | **Extraction Studio Workbench**: Dual-pane workspace with PDF document preview, `@retab/schema-builder`, and real-time SSE extraction progress. |
| `/history` | `src/app/history/page.tsx` | **Extraction History**: Auditable table of all extraction runs, token metrics, raw JSON inspector dialog, and deep-links to harmonization. |
| `/harmonize/[id]` | `src/app/harmonize/[id]/page.tsx` | **Data Harmonization Studio**: Field-to-field schema mapper, AST formula editor, debounced live preview diff, and guarded enterprise commit. |

---

## 🧩 Component Directory Structure

```
frontend/src/
├── app/
│   ├── layout.tsx             # Root layout with Geist font & sonner Toaster
│   ├── page.tsx               # Studio Workbench dual-pane interface
│   ├── history/page.tsx       # Extraction history & audit dashboard
│   └── harmonize/[id]/page.tsx# Visual data harmonizer studio
│
├── components/
│   ├── studio/
│   │   ├── pdf-viewer.tsx     # Drag-and-drop upload, 150 DPI page renderer, zoom & page jump
│   │   └── results-panel.tsx  # Live SSE progress bar, formatted JSON tree, and record table
│   ├── retab/
│   │   └── schema-editor-panel.tsx # Retab SchemaBuilder wrapper with toolbar & template loader
│   ├── schema-editor/         # Grounded @retab/schema-builder component implementation
│   ├── harmonizer/
│   │   ├── studio-header.tsx  # Target collection selector, job status, and commit trigger
│   │   ├── mapping-table.tsx  # Source-to-target field mappings & matching method picker
│   │   ├── formula-dialog.tsx # AST formula editor with syntax reference & live evaluator
│   │   └── live-preview-panel.tsx # 300ms debounced raw vs. harmonized diff & diagnostics
│   └── ui/                    # shadcn/ui primitives (dialog, button, table, tabs, badge, etc.)
│
├── hooks/
│   ├── use-mounted.ts         # Hydration-safe client mounting hook
│   └── use-mount-effect.ts    # Safe one-time mount execution hook
│
└── lib/
    ├── api-client.ts          # Type-safe client communicating with FastAPI backend
    ├── types.ts               # Shared TypeScript domain models & DTOs
    └── utils.ts               # Styling helpers (clsx, twMerge)
```

---

## ⚙️ Environment Variables

Configure these variables in `.env` (or pass via environment at container runtime):

| Variable | Default Value | Purpose |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8001/api` | Base URL for FastAPI backend REST endpoints and SSE streams |
| `NEXT_PUBLIC_BACKEND_URL` | `http://localhost:8001` | Root backend URL for direct links or health checks |

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Build for Production
```bash
npm run build
npm run start
```

### 4. Run via Docker
```bash
docker build -t hamon-frontend .
docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=http://localhost:8001/api hamon-frontend
```
*(In the monorepo root, simply run `docker compose up -d` to launch the frontend, backend, and both MongoDB databases together).*

---

## 🔗 Key Capabilities

- **Grounded Retab UI Integration**: Visual schema designer powered by `@retab/schema-builder` supporting Draft-07 JSON Schema templates (Commercial Invoice, Clinical / Lab Report), field adding/editing, and raw JSON mode.
- **Incremental PDF Preview**: Renders crisp 150 DPI PNG pages generated on-demand by the backend (`pypdfium2`), with page jumping, zoom controls, and thumbnail ribbon.
- **Server-Sent Events (SSE)**: Streams live multi-stage extraction progress (`waiting_for_render` -> `extracting` -> `merging` -> `completed` / `partial_success`), updating the results panel without polling.
- **Visual Harmonization & AST Formulas**: Map extracted fields to enterprise MongoDB collections, select matching algorithms (LLM, Heuristic, BDI-Kit), write sandboxed formulas (`round(qty * price, 2)`), view live side-by-side diff previews, and commit with null-key quarantine safety.
