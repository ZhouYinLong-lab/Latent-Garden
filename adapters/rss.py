from __future__ import annotations

from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import unescape
import json
from pathlib import Path
import re
from urllib.parse import urljoin
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

from core.models import ContentItem


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _child_text(element: ET.Element, *names: str) -> str:
    wanted = set(names)
    for child in list(element):
        if _local_name(child.tag) in wanted:
            return "".join(child.itertext()).strip()
    return ""


def _link(element: ET.Element) -> str | None:
    for child in list(element):
        if _local_name(child.tag) != "link":
            continue
        href = child.attrib.get("href") or "".join(child.itertext()).strip()
        if href:
            return href
    return None


def _strip_html(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", unescape(value))).strip()


def _date(value: str) -> str | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value[:10] if re.match(r"\d{4}-\d{2}-\d{2}", value) else None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.date().isoformat()


def load_rss_text(text: str, source: str = "feed.xml", base_url: str | None = None) -> list[ContentItem]:
    root = ET.fromstring(text)
    elements = [element for element in root.iter() if _local_name(element.tag) in {"item", "entry"}]
    items: list[ContentItem] = []
    for index, element in enumerate(elements):
        title = _child_text(element, "title") or f"Feed item {index + 1}"
        url = _link(element)
        if url and base_url:
            url = urljoin(base_url, url)
        summary = _strip_html(_child_text(element, "description", "summary"))
        body = _strip_html(_child_text(element, "encoded", "content")) or summary
        tags = [
            _strip_html(child.attrib.get("term") or child.text or "")
            for child in list(element)
            if _local_name(child.tag) == "category" and (child.attrib.get("term") or child.text or "").strip()
        ]
        identity = _child_text(element, "guid", "id") or url or title
        items.append(
            ContentItem(
                id=re.sub(r"[^\w\u4e00-\u9fff-]+", "-", identity.lower()).strip("-"),
                title=_strip_html(title),
                description=summary[:400] or body[:400],
                body=body or summary or title,
                tags=list(dict.fromkeys(tags)),
                date=_date(_child_text(element, "pubdate", "published", "updated")),
                url=url,
                content_type="article",
                source_path=source,
                metadata={"source": "rss"},
            )
        )
    return items


def load_rss(source: str | Path) -> list[ContentItem]:
    source_value = str(source)
    if source_value.startswith(("http://", "https://")):
        request = Request(source_value, headers={"User-Agent": "Latent-Garden/0.1"})
        with urlopen(request, timeout=30) as response:
            text = response.read().decode("utf-8", errors="replace")
        return load_rss_text(text, source=source_value, base_url=source_value)
    path = Path(source)
    return load_rss_text(path.read_text(encoding="utf-8"), source=str(path), base_url=path.as_uri())
