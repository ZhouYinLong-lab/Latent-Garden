from __future__ import annotations

from dataclasses import dataclass
from html import unescape as html_unescape
from html.parser import HTMLParser
import json
from pathlib import Path, PurePosixPath
import re
import warnings
from urllib.parse import quote, unquote, urljoin, urlparse
from urllib.request import Request, urlopen

from core.models import ContentItem


_VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
_SKIP_TAGS = {"script", "style", "noscript", "nav", "footer", "aside", "form", "button", "dialog"}
_SKIP_MARKERS = {
    "breadcrumb", "comment", "comments", "giscus", "menu", "navbar", "pagination", "share", "sidebar",
    "social", "table-of-contents", "toc", "toolbar",
}
_DEFAULT_BOILERPLATE_PATTERNS = (
    r"^正在加载评论",
    r"^评论\s*[（(].*github",
    r"(查看源代码|view source).*(github|gitlab)",
    r"^(上一页|下一页|返回顶部|分享|目录)$",
    r"^(copyright|all rights reserved|版权所有)",
)


@dataclass(frozen=True, slots=True)
class WebsiteAdapterConfig:
    """Optional site-level cleanup rules without coupling the adapter to one blog."""

    title_prefixes: tuple[str, ...] = ()
    boilerplate_patterns: tuple[str, ...] = _DEFAULT_BOILERPLATE_PATTERNS
    min_description_length: int = 12
    description_overrides: tuple[tuple[str, str], ...] = ()

    @classmethod
    def from_mapping(cls, payload: dict) -> "WebsiteAdapterConfig":
        website = payload.get("website", payload)
        prefixes = tuple(str(value) for value in website.get("title_prefixes", []) if str(value).strip())
        extra_patterns = tuple(str(value) for value in website.get("boilerplate_patterns", []) if str(value).strip())
        minimum = int(website.get("min_description_length", 12))
        overrides = tuple(
            (str(key), _clean_text(value))
            for key, value in website.get("description_overrides", {}).items()
            if _clean_text(value)
        )
        if minimum < 0:
            raise ValueError("min_description_length must not be negative")
        return cls(
            title_prefixes=prefixes,
            boilerplate_patterns=_DEFAULT_BOILERPLATE_PATTERNS + extra_patterns,
            min_description_length=minimum,
            description_overrides=overrides,
        )


def load_website_config(path: str | Path) -> WebsiteAdapterConfig:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Website config must contain a JSON object")
    return WebsiteAdapterConfig.from_mapping(payload)


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
        self._depth = 0
        self._skip_until_depth: int | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        attributes = {key.lower(): value for key, value in attrs}
        is_void = tag in _VOID_TAGS
        if not is_void:
            self._depth += 1
        if self._skip_until_depth is not None:
            return
        if tag == "meta":
            key = attributes.get("name") or attributes.get("property")
            value = attributes.get("content")
            if key and value:
                self.meta[key.lower()] = _clean_text(value)
        marker_text = " ".join(
            str(attributes.get(key) or "").lower() for key in ("id", "class", "role", "aria-label")
        )
        marker_tokens = set(re.findall(r"[a-z0-9-]+", marker_text))
        if tag in _SKIP_TAGS or marker_tokens.intersection(_SKIP_MARKERS):
            if not is_void:
                self._skip_until_depth = self._depth
            return
        if tag == "a":
            self._anchor_href = attributes.get("href")
            self._anchor_text = []
        elif tag in {"h1", "h2"}:
            self._heading_text = []
        elif tag == "p":
            self._paragraph_text = []

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if self._skip_until_depth is not None:
            if self._depth == self._skip_until_depth:
                self._skip_until_depth = None
            self._depth = max(0, self._depth - 1)
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
        self._depth = max(0, self._depth - 1)

    def handle_data(self, data: str) -> None:
        if self._skip_until_depth is not None:
            return
        if self._anchor_href is not None:
            self._anchor_text.append(data)
        if self._heading_text is not None:
            self._heading_text.append(data)
        if self._paragraph_text is not None:
            self._paragraph_text.append(data)


def _clean_text(value: str) -> str:
    value = html_unescape(str(value or ""))
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"[\u200b-\u200f\u2060\ufeff]", "", value)
    value = "".join(character for character in value if character.isprintable() or character.isspace())
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


def _is_boilerplate(value: str, config: WebsiteAdapterConfig) -> bool:
    return any(re.search(pattern, value, flags=re.IGNORECASE) for pattern in config.boilerplate_patterns)


def _unique_text(values: list[str], config: WebsiteAdapterConfig, *, exclude: str = "") -> list[str]:
    seen: set[str] = set()
    cleaned: list[str] = []
    excluded = _clean_text(exclude).casefold()
    for value in values:
        text = _clean_text(value)
        key = text.casefold()
        if not text or key == excluded or key in seen or _is_boilerplate(text, config):
            continue
        seen.add(key)
        cleaned.append(text)
    return cleaned


def _clean_title(value: str, config: WebsiteAdapterConfig) -> str:
    title = _clean_text(value)
    changed = True
    while changed:
        changed = False
        for prefix in sorted(config.title_prefixes, key=len, reverse=True):
            if title.casefold().startswith(prefix.casefold()):
                title = title[len(prefix):].lstrip(" \t·•|｜:：—-–")
                changed = True
                break
    return title.strip()


def _select_description(meta_description: str, paragraphs: list[str], title: str, config: WebsiteAdapterConfig) -> str:
    meta_description = _clean_text(meta_description)
    if (
        len(meta_description) >= config.min_description_length
        and meta_description.casefold() != title.casefold()
        and not _is_boilerplate(meta_description, config)
    ):
        return meta_description[:400]
    selected: list[str] = []
    for paragraph in paragraphs:
        selected.append(paragraph)
        combined = " ".join(selected)
        if len(combined) >= config.min_description_length:
            return combined[:400]
    combined = " ".join(selected)
    titled = f"{title}：{combined}" if combined else ""
    return (titled if len(titled) >= config.min_description_length else combined)[:400]


def _item_from_page(
    url: str,
    html: str,
    config: WebsiteAdapterConfig | None = None,
) -> ContentItem:
    config = config or WebsiteAdapterConfig()
    parser = _parse(html)
    parsed = urlparse(url)
    slug = unquote(PurePosixPath(parsed.path.rstrip("/")).name)
    candidates = parser.headings + [parser.meta.get("og:title", ""), slug]
    title = next(
        (cleaned for value in candidates if (cleaned := _clean_title(value, config)) and not _is_boilerplate(cleaned, config)),
        "",
    )
    if not title:
        raise ValueError("Article title is empty after cleanup")
    paragraphs = _unique_text(parser.paragraphs, config, exclude=title)
    overrides = dict(config.description_overrides)
    preferred_description = overrides.get(slug) or overrides.get(title) or parser.meta.get("description", "")
    description = _select_description(preferred_description, paragraphs, title, config)
    if len(description) < config.min_description_length:
        raise ValueError(f"Article description is shorter than {config.min_description_length} characters")
    body = "\n\n".join(paragraphs) or description
    tags = _unique_text(
        [text for href, text in parser.links if "/blog/tag/" in href],
        config,
    )
    return ContentItem(
        id=re.sub(r"[^\w\u4e00-\u9fff-]+", "-", slug.lower()).strip("-"),
        title=title,
        description=description,
        body=body,
        tags=tags,
        date=_date_from(" ".join(paragraphs) + " " + html),
        url=url,
        content_type="article",
        source_path=url,
        metadata={"source": "website", "site": urlparse(url).netloc},
    )


def load_website(
    base_url: str,
    max_pages: int = 6,
    config: WebsiteAdapterConfig | None = None,
) -> list[ContentItem]:
    """Load cleaned public article metadata and text from a blog with Astro-style routes."""
    parsed_base = urlparse(base_url)
    if parsed_base.scheme not in {"http", "https"} or not parsed_base.netloc:
        raise ValueError("Website source must be an http(s) URL")
    if max_pages < 1:
        raise ValueError("max_pages must be at least 1")
    config = config or WebsiteAdapterConfig()
    unique_items: dict[str, ContentItem] = {}
    failures = 0
    for article_url in discover_article_paths(base_url, max_pages=max_pages):
        try:
            item = _item_from_page(article_url, _fetch(article_url), config=config)
        except (OSError, UnicodeError, ValueError):
            failures += 1
            continue
        key = item.title.casefold()
        previous = unique_items.get(key)
        if previous is None or len(item.body) > len(previous.body):
            unique_items[key] = item
    items = list(unique_items.values())
    if not items:
        raise ValueError(f"No public article pages passed quality checks at {base_url}")
    if failures:
        warnings.warn(f"Skipped {failures} article page(s) that failed fetch or quality checks", RuntimeWarning, stacklevel=2)
    return sorted(items, key=lambda item: item.date or "", reverse=True)
