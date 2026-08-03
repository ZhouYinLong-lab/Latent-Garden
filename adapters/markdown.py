from __future__ import annotations

from pathlib import Path
import re
from typing import Any

from core.models import ContentItem


FRONTMATTER = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?", re.DOTALL)
HEADING = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)


def _scalar(value: str) -> Any:
    value = value.strip().strip('"\'')
    if value.startswith("[") and value.endswith("]"):
        return [part.strip().strip('"\'') for part in value[1:-1].split(",") if part.strip()]
    return value


def _frontmatter(text: str) -> tuple[dict[str, Any], str]:
    match = FRONTMATTER.match(text)
    if not match:
        return {}, text
    data: dict[str, Any] = {}
    for line in match.group(1).splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = _scalar(value)
    return data, text[match.end():]


def _clean_mdx(text: str) -> str:
    text = re.sub(r"^\s*(import|export)\s+.+$", "", text, flags=re.MULTILINE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"!\[[^]]*\]\([^)]*\)", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def load_markdown(path: str | Path) -> ContentItem:
    file_path = Path(path)
    raw = file_path.read_text(encoding="utf-8")
    metadata, body = _frontmatter(raw)
    body = _clean_mdx(body)
    heading = HEADING.search(body)
    title = str(metadata.get("title") or (heading.group(1).strip() if heading else file_path.stem))
    paragraphs = [line.strip() for line in body.splitlines() if line.strip() and not line.startswith("#")]
    description = str(metadata.get("description") or (paragraphs[0][:240] if paragraphs else ""))
    tags = metadata.get("tags", [])
    if isinstance(tags, str):
        tags = [part.strip() for part in re.split(r"[,，]", tags) if part.strip()]
    return ContentItem(
        id=str(metadata.get("id") or file_path.stem),
        title=title,
        description=description,
        body=body,
        tags=list(tags),
        date=str(metadata["date"]) if metadata.get("date") else None,
        url=str(metadata["url"]) if metadata.get("url") else None,
        content_type=str(metadata.get("type") or metadata.get("content_type") or "article"),
        source_path=str(file_path),
        metadata={key: value for key, value in metadata.items() if key not in {"id", "title", "description", "tags", "date", "url", "type", "content_type"}},
    )
