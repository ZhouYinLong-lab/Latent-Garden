from __future__ import annotations

from pathlib import Path

from core.models import ContentItem
from .json_adapter import load_json
from .markdown import load_markdown


def load_content(source: str | Path) -> list[ContentItem]:
    path = Path(source)
    files = [path] if path.is_file() else [file for file in path.rglob("*") if file.is_file()]
    items: list[ContentItem] = []
    for file in sorted(files):
        suffix = file.suffix.lower()
        if suffix in {".md", ".mdx"}:
            items.append(load_markdown(file))
        elif suffix == ".json":
            items.extend(load_json(file))
    if not items:
        raise ValueError(f"No Markdown, MDX, or JSON content found in {path}")
    return items
