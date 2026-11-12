# Third-Party Software & Open-Source Licenses Audit

This document inventories the third-party open-source packages, libraries, and mirrored components integrated into the **Hamon Document Extraction & Data Harmonization Platform**, confirming license compliance and attribution.

---

## 1. Core Mirrored & Grounded Repositories

### `retab-ui` (@retab/schema-builder)
- **Repository**: [https://github.com/retab-ai/retab-ui](https://github.com/retab-ai/retab-ui)
- **License**: MIT License
- **Copyright**: (c) 2024 Retab AI
- **Usage**: JSON Schema visual designer, schema-editor primitives, and AST type guards.

### `bdi-kit` (bdikit)
- **Repository**: [https://github.com/VIDA-NYU/bdi-kit](https://github.com/VIDA-NYU/bdi-kit)
- **License**: Apache License 2.0
- **Copyright**: (c) NYU Center for Data Science & VIDA Center
- **Usage**: Automated schema matching, string/semantic value alignment, and data integration heuristics.

### `lift` (lift-pdf)
- **Repository**: [https://github.com/lift-ai/lift](https://github.com/lift-ai/lift)
- **License**: Apache License 2.0
- **Copyright**: (c) 2024 Lift AI
- **Usage**: Vision extraction prompt scaffolding, aspect-ratio image scaling (`scale_to_fit`), and repeat token loop detection.

---

## 2. Python Backend Dependencies

| Package | Version Range | License | Description / Purpose |
| :--- | :--- | :--- | :--- |
| `fastapi` | `>=0.115.0` | MIT | Asynchronous REST and SSE web framework |
| `uvicorn` | `>=0.30.0` | BSD-3-Clause | Production ASGI application server |
| `pydantic` | `>=2.10.0` | MIT | Data parsing and validation models |
| `pymongo` | `>=4.10.0` | Apache-2.0 | Asynchronous MongoDB driver |
| `pypdfium2` | `>=4.30.0` | Apache-2.0 / BSD-3-Clause | Native PDFium rasterizer (forms & annotations) |
| `pillow` | `>=10.4.0` | HPND (MIT equivalent) | Image processing and aspect-ratio resampling |
| `litellm` | `>=1.52.0` | MIT | Universal LLM completion abstraction & cost tracking |
| `pandas` | `>=2.2.0` | BSD-3-Clause | Columnar data normalization (`json_normalize`) |
| `simpleeval` | `>=1.0.0` | MIT | Sandboxed AST formula evaluator |
| `jsonschema` | `>=4.20.0` | MIT | Draft-07 schema validation |
| `sse-starlette`| `>=2.1.0` | BSD-3-Clause | Server-Sent Events streaming transport |
| `python-multipart`| `>=0.0.9` | Apache-2.0 | Streaming multipart form file uploads |

---

## 3. Frontend Dependencies

| Package | Version Range | License | Description / Purpose |
| :--- | :--- | :--- | :--- |
| `next` | `14.2.35` | MIT | React full-stack application framework |
| `react` / `react-dom` | `18.x` | MIT | Core UI rendering library |
| `tailwindcss` | `3.4.x` | MIT | Utility-first styling framework |
| `@radix-ui/*` | `^1.x` | MIT | Accessible unstyled primitives (tabs, dialogs, selects) |
| `lucide-react` | `^0.468.0` | ISC (MIT equivalent) | Clean vector icons |
| `zod` | `^3.23.0` | MIT | Type-safe schema declarations |

---

## 4. Compliance Checklist

- [x] **Permissive Licensing**: All dependencies utilize commercial-friendly permissive licenses (MIT, Apache 2.0, BSD-3-Clause, ISC). No copyleft (GPL, AGPL) dependencies are used in backend or frontend runtimes.
- [x] **Attribution Preserved**: Original copyright notices and repository origins remain documented in `.reference/INDEX.md` and repository manifests.
- [x] **Isolated Security Domains**: Sandboxed execution rules prevent dunder traversal in `simpleeval`, and isolated MongoDB connection pools separate application operations from target enterprise records.
