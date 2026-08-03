from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from core.models import ContentItem


def _item(data: dict[str, Any], index: int, source_path: Path) -> ContentItem:
    body = str(data.get("body") or data.get("content") or data.get("text") or "")
    title = str(data.get("title") or data.get("name") or f"Item {index + 1}")
    tags = data.get("tags") or data.get("labels") or []
    if isinstance(tags, str):
        tags = [tags]
    reserved = {"id", "title", "name", "body", "content", "text", "description", "tags", "labels", "date", "url", "type", "content_type"}
    return ContentItem(
        id=str(data.get("id") or source_path.stem + f"-{index + 1}"),
        title=title,
        description=str(data.get("description") or body[:240]),
        body=body,
        tags=[str(tag) for tag in tags],
        date=str(data["date"]) if data.get("date") else None,
        url=str(data["url"]) if data.get("url") else None,
        content_type=str(data.get("type") or data.get("content_type") or "document"),
        source_path=str(source_path),
        metadata={key: value for key, value in data.items() if key not in reserved},
    )


def load_json(path: str | Path) -> list[ContentItem]:
    file_path = Path(path)
    data = json.loads(file_path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("items") or data.get("content") or [data]
    if not isinstance(data, list):
        raise ValueError(f"JSON source must contain an object or list: {file_path}")
    return [_item(item, index, file_path) for index, item in enumerate(data) if isinstance(item, dict)]
