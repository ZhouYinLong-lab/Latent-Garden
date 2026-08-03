from __future__ import annotations

from html.parser import HTMLParser
from pathlib import PurePosixPath
import re
from urllib.parse import quote, unquote, urljoin, urlparse
from urllib.request import Request, urlopen

from core.models import ContentItem


class _DocumentParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, str]] = []
        self.meta: dict[str, str] = {}
        self.headings: list[str] = []
        self.paragraphs: list[str] = []
        self._anchor_href: str | None = None
        self._anchor_text: list[str] = []
        self._heading_text: list[str] | None = None
        self._paragraph_text: list[str] | None = None
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "meta":
            key = attributes.get("name") or attributes.get("property")
            value = attributes.get("content")
            if key and value:
                self.meta[key.lower()] = value.strip()
        if tag in {"script", "style", "noscript", "nav", "footer"}:
            self._skip_depth += 1
        if self._skip_depth:
            return
        if tag == "a":
            self._anchor_href = attributes.get("href")
            self._anchor_text = []
        elif tag in {"h1", "h2"}:
            self._heading_text = []
        elif tag == "p":
            self._paragraph_text = []

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript", "nav", "footer"}:
            self._skip_depth = max(0, self._skip_depth - 1)
            return
        if self._skip_depth:
            return
        if tag == "a" and self._anchor_href:
            text = _clean_text(" ".join(self._anchor_text))
            self.links.append((self._anchor_href, text))
            self._anchor_href = None
            self._anchor_text = []
        elif tag in {"h1", "h2"} and self._heading_text is not None:
            heading = _clean_text(" ".join(self._heading_text))
            if heading:
                self.headings.append(heading)
            self._heading_text = None
        elif tag == "p" and self._paragraph_text is not None:
            paragraph = _clean_text(" ".join(self._paragraph_text))
            if paragraph:
                self.paragraphs.append(paragraph)
            self._paragraph_text = None

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        if self._anchor_href is not None:
            self._anchor_text.append(data)
        if self._heading_text is not None:
            self._heading_text.append(data)
        if self._paragraph_text is not None:
            self._paragraph_text.append(data)


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _fetch(url: str) -> str:
    request = Request(url, headers={"User-Agent": "Latent-Garden/0.1 (+https://github.com/ZhouYinLong-lab/Latent-Garden)"})
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def _parse(html: str) -> _DocumentParser:
    parser = _DocumentParser()
    parser.feed(html)
    return parser


def _is_article_path(path: str) -> bool:
    normalized = path.rstrip("/")
    if not normalized.startswith("/blog/") or normalized.count("/") != 2:
        return False
    slug = normalized.rsplit("/", 1)[-1]
    return slug not in {"archives", "categories", "tags", "search"} and not slug.isdigit()


def discover_article_paths(base_url: str, max_pages: int = 6) -> list[str]:
    root = base_url.rstrip("/") + "/"
    pages = [urljoin(root, "/blog/")] + [urljoin(root, f"/blog/{page}") for page in range(2, max_pages + 1)]
    paths: dict[str, str] = {}
    for page_url in pages:
        try:
            parser = _parse(_fetch(page_url))
        except OSError:
            continue
        for href, text in parser.links:
            absolute = urljoin(page_url, href)
            parsed = urlparse(absolute)
            if parsed.netloc == urlparse(root).netloc and _is_article_path(parsed.path) and text:
                encoded_path = quote(parsed.path, safe="/%:@")
                paths[parsed.path.rstrip("/") + "/"] = parsed._replace(path=encoded_path).geturl()
    return list(paths.values())


def _date_from(text: str) -> str | None:
    match = re.search(r"(20\d{2})年(\d{1,2})月(\d{1,2})日", text)
    if not match:
        return None
    return f"{match.group(1)}-{int(match.group(2)):02d}-{int(match.group(3)):02d}"


def _item_from_page(url: str, html: str) -> ContentItem:
    parser = _parse(html)
    parsed = urlparse(url)
    slug = unquote(PurePosixPath(parsed.path.rstrip("/")).name)
    title = parser.headings[0] if parser.headings else parser.meta.get("og:title") or slug
    description = parser.meta.get("description") or (parser.paragraphs[0] if parser.paragraphs else title)
    body = "\n\n".join(parser.paragraphs)
    tags = []
    for href, text in parser.links:
        if "/blog/tag/" in href and text and text not in tags:
            tags.append(text)
    return ContentItem(
        id=re.sub(r"[^\w\u4e00-\u9fff-]+", "-", slug.lower()).strip("-"),
        title=title,
        description=description[:400],
        body=body or description,
        tags=tags,
        date=_date_from(" ".join(parser.paragraphs) + " " + html),
        url=url,
        content_type="article",
        source_path=url,
        metadata={"source": "website", "site": urlparse(url).netloc},
    )


def load_website(base_url: str, max_pages: int = 6) -> list[ContentItem]:
    """Load public article metadata and text from a blog with Astro-style routes."""
    items = []
    for article_url in discover_article_paths(base_url, max_pages=max_pages):
        try:
            items.append(_item_from_page(article_url, _fetch(article_url)))
        except OSError:
            continue
    if not items:
        raise ValueError(f"No public article pages found at {base_url}")
    return sorted(items, key=lambda item: item.date or "", reverse=True)
