---
trigger: always_on
description: Prevent hallucinating third-party repositories, enforce reading local reference clones and live documentation, and ban unrequested mock implementations.
---

# Strict Grounding, Repository Linking & Documentation Rules

You must follow these rules on every task without exception:

## 1. Never Hallucinate or "Vendor" Unfamiliar Libraries From Memory
- You are **STRICTLY FORBIDDEN** from inventing, mocking, or writing replacement implementations from memory when a prompt references an external repository, shadcn registry component (such as `@retab/*`), or Python toolkit (such as `bdi-kit` / `bdikit`).
- If a CLI installation command or import fails, **STOP**, inspect the error, check `.reference/INDEX.md`, and fix the configuration. Never fabricate placeholder components to bypass a failed install.

## 2. Always Check `references.json` and `.reference/` First
- This workspace uses `references.json` and `scripts/sync_references.py` to link external GitHub repositories into `.reference/repos/<name>/` and index official documentation URLs in `.reference/INDEX.md`.
- **Before writing any code that integrates an external library:**
  1. Read `references.json` and `.reference/INDEX.md`.
  2. If `.reference/repos/` is missing or outdated, run `python3 scripts/sync_references.py` in the terminal.
  3. Use your local file tools (`view_file`, `find_by_name`, `grep_search`) inside `.reference/repos/<repo-name>/` to verify the exact file paths, exported component/function names, TypeScript interfaces, and Python function signatures.

## 3. Fetch Live Documentation From Registered Sites
- Whenever you need usage examples, configuration flags, or API details for a library listed under `"documentation_sites"` in `references.json`:
  - Check `.reference/docs/` for cached documentation snapshots first.
  - Use `search_web` or your browser tool restricted to the exact base URLs defined in `references.json` (e.g., `https://ui.retab.com/docs`, `https://bdi-kit.readthedocs.io/stable/`, `https://docs.litellm.ai/`).

## 4. Non-Interactive CLI Execution
- Always pass non-interactive flags (`-y` or `--yes`) to `npx shadcn@latest` and package manager commands so terminal prompts never hang.
- For `@retab` components, always install using the full registry URL (e.g., `npx shadcn@latest add "https://ui.retab.com/r/schema-builder.json" -y`) or verify `@retab` is configured under `"registries"` in `frontend/components.json`.
