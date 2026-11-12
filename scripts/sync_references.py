#!/usr/bin/env python3
"""
Sync Reference Repositories and Documentation Snapshots.
Reads references.json and downloads/syncs external repos and doc pages
into the local .reference/ directory, generating .reference/INDEX.md.
Uses standard library only.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

os.environ["GIT_SSL_NO_VERIFY"] = "true"

ROOT_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT_DIR / "references.json"
REF_DIR = ROOT_DIR / ".reference"
REPOS_DIR = REF_DIR / "repos"
DOCS_DIR = REF_DIR / "docs"
INDEX_PATH = REF_DIR / "INDEX.md"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        print(f"Error: {CONFIG_PATH} not found.", file=sys.stderr)
        sys.exit(1)
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def sync_repository(repo: dict, active_repo_names: set[str]) -> None:
    name = repo.get("name")
    url = repo.get("url")
    branch = repo.get("branch", "main")
    if not name or not url:
        return

    active_repo_names.add(name)
    target_dir = REPOS_DIR / name

    if not target_dir.exists():
        print(f"[*] Cloning {name} ({branch}) from {url}...")
        target_dir.parent.mkdir(parents=True, exist_ok=True)
        # Try requested branch first
        res = subprocess.run(
            ["git", "clone", "--depth", "1", "--branch", branch, url, str(target_dir)],
            capture_output=True,
            text=True,
        )
        if res.returncode != 0:
            print(f"  [!] Branch '{branch}' failed. Retrying default branch for {name}...")
            res_default = subprocess.run(
                ["git", "clone", "--depth", "1", url, str(target_dir)],
                capture_output=True,
                text=True,
            )
            if res_default.returncode != 0:
                print(f"  [X] Failed to clone {name}: {res_default.stderr.strip()}", file=sys.stderr)
                return
        print(f"  [OK] Cloned {name} successfully.")
    else:
        print(f"[*] Updating existing repo {name}...")
        res = subprocess.run(
            ["git", "-C", str(target_dir), "pull", "--ff-only"],
            capture_output=True,
            text=True,
        )
        if res.returncode != 0:
            print(f"  [!] Pull failed for {name} ({res.stderr.strip()}). Leaving local copy.", file=sys.stderr)
        else:
            print(f"  [OK] Updated {name}.")


def prune_unlisted_repos(active_names: set[str]) -> None:
    if not REPOS_DIR.exists():
        return
    for item in REPOS_DIR.iterdir():
        if item.is_dir() and item.name not in active_names:
            print(f"[-] Pruning unlisted reference repo: {item.name}")
            shutil.rmtree(item, ignore_errors=True)


def download_url(url: str, dest_path: Path) -> bool:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/json,*/*"},
    )
    ssl_context = None
    try:
        import ssl
        ssl_context = ssl.create_default_context()
    except Exception:
        pass

    try:
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            resp_cm = urllib.request.urlopen(req, timeout=15, context=ssl_context)
        except urllib.error.URLError as e:
            if "CERTIFICATE_VERIFY_FAILED" in str(e):
                import ssl
                resp_cm = urllib.request.urlopen(
                    req, timeout=15, context=ssl._create_unverified_context()
                )
            else:
                raise e
        with resp_cm as resp:
            content = resp.read()
            with open(dest_path, "wb") as f:
                f.write(content)
        return True
    except urllib.error.URLError as e:
        print(f"  [!] Failed fetching {url}: {e}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"  [!] Unexpected error fetching {url}: {e}", file=sys.stderr)
        return False


def sanitize_filename(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    path = parsed.path.strip("/")
    if not path:
        return "index.html"
    sanitized = path.replace("/", "__")
    if not sanitized.endswith((".html", ".json", ".txt", ".md")):
        sanitized += ".html"
    return sanitized


def sync_documentation(doc_site: dict) -> None:
    name = doc_site.get("name")
    base_url = doc_site.get("url")
    key_pages = doc_site.get("key_pages", [])
    if not name:
        return

    site_dir = DOCS_DIR / name
    site_dir.mkdir(parents=True, exist_ok=True)
    print(f"[*] Caching docs for {name}...")

    urls_to_fetch = []
    if base_url:
        urls_to_fetch.append(base_url)
    urls_to_fetch.extend(key_pages)

    for url in urls_to_fetch:
        fname = sanitize_filename(url)
        dest = site_dir / fname
        if download_url(url, dest):
            print(f"  [OK] Saved {url} -> {dest.relative_to(ROOT_DIR)}")


def generate_tree(path: Path, max_depth: int = 2, current_depth: int = 1) -> list[str]:
    lines = []
    if current_depth > max_depth or not path.exists():
        return lines

    try:
        entries = sorted(path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    except OSError:
        return lines

    for entry in entries:
        if entry.name.startswith((".", "__pycache__")):
            continue
        indent = "  " * (current_depth - 1)
        if entry.is_dir():
            lines.append(f"{indent}- **{entry.name}/**")
            lines.extend(generate_tree(entry, max_depth, current_depth + 1))
        else:
            lines.append(f"{indent}- {entry.name}")
    return lines


def build_index(config: dict) -> None:
    lines = [
        "# Reference Repositories and Documentation Index",
        "",
        "This file is auto-generated by `scripts/sync_references.py`.",
        "It provides local file paths to linked external repositories and cached documentation.",
        "",
        "## Linked Repositories (`.reference/repos/`)",
        "",
    ]

    repos = config.get("repositories", [])
    if not repos:
        lines.append("_No repositories configured in `references.json`._\n")
    else:
        for repo in repos:
            name = repo.get("name", "")
            desc = repo.get("description", "")
            repo_path = REPOS_DIR / name
            lines.append(f"### `{name}`")
            if desc:
                lines.append(f"> {desc}")
            lines.append(f"- **Local Path:** `.reference/repos/{name}`")
            lines.append(f"- **Remote URL:** {repo.get('url')}")
            lines.append(f"- **Branch:** {repo.get('branch', 'main')}")
            lines.append("")
            lines.append("#### Structure (Top 2 Levels):")
            if repo_path.exists():
                tree_lines = generate_tree(repo_path, max_depth=2)
                if tree_lines:
                    lines.extend(tree_lines)
                else:
                    lines.append("  _(empty repository)_")
            else:
                lines.append("  _(not yet cloned)_")
            lines.append("")

    lines.append("## Cached Documentation Snapshots (`.reference/docs/`)")
    lines.append("")
    doc_sites = config.get("documentation_sites", [])
    if not doc_sites:
        lines.append("_No documentation sites configured._\n")
    else:
        for site in doc_sites:
            name = site.get("name", "")
            base_url = site.get("url", "")
            lines.append(f"### `{name}`")
            lines.append(f"- **Base URL:** {base_url}")
            site_dir = DOCS_DIR / name
            if site_dir.exists():
                lines.append("- **Cached Files:**")
                cached = sorted(site_dir.glob("*"))
                for c in cached:
                    lines.append(f"  - `{c.relative_to(ROOT_DIR)}` ({c.stat().st_size:,} bytes)")
            else:
                lines.append("  _(not yet cached)_")
            lines.append("")

    INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"[OK] Generated index at {INDEX_PATH.relative_to(ROOT_DIR)}")


def main() -> None:
    config = load_config()
    REF_DIR.mkdir(parents=True, exist_ok=True)
    REPOS_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)

    active_repos: set[str] = set()
    for repo in config.get("repositories", []):
        sync_repository(repo, active_repos)

    prune_unlisted_repos(active_repos)

    for site in config.get("documentation_sites", []):
        sync_documentation(site)

    build_index(config)
    print("\n[OK] References synchronization complete.")


if __name__ == "__main__":
    main()
