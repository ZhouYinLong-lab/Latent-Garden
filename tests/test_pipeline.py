import json
import tempfile
import unittest
from pathlib import Path

from adapters import load_content
from adapters.website import _item_from_page, discover_article_paths
from adapters.rss import load_rss_text
from core.models import ContentItem
from pipeline.cache import EmbeddingCache
from pipeline.runner import build_garden
from pipeline.runner import _normalize_points
from pipeline.cli import _same_garden
from providers.hash_provider import HashEmbeddingProvider


class CountingProvider(HashEmbeddingProvider):
    name = "counting"

    def __init__(self):
        super().__init__(dimensions=8)
        self.calls = 0

    def embed(self, texts):
        self.calls += 1
        return super().embed(texts)


class PipelineTests(unittest.TestCase):
    def test_website_adapter_recognizes_article_routes(self):
        html = """
        <a href="/blog/example">Example article</a>
        <a href="/blog/tag/python">Python</a>
        <a href="/blog/2">2</a>
        <a href="/blog/categories">Categories</a>
        """
        from adapters.website import _parse
        parser = _parse(html)
        paths = [href for href, text in parser.links if text and href.startswith("/blog/") and href.count("/") == 2 and href.rsplit("/", 1)[-1] not in {"categories"} and not href.rsplit("/", 1)[-1].isdigit()]
        self.assertEqual(paths, ["/blog/example"])

    def test_rss_adapter_normalizes_rss_and_atom_fields(self):
        feed = """
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>tag:example.com,2026:one</id>
            <title>一个条目</title>
            <link href="/one" />
            <updated>2026-08-03T12:00:00Z</updated>
            <category term="实验" />
            <summary>简短摘要</summary>
            <content>正文内容</content>
          </entry>
        </feed>
        """
        items = load_rss_text(feed, base_url="https://example.com/feed.xml")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].title, "一个条目")
        self.assertEqual(items[0].date, "2026-08-03")
        self.assertEqual(items[0].url, "https://example.com/one")
        self.assertEqual(items[0].body, "正文内容")
        self.assertEqual(items[0].tags, ["实验"])

    def test_website_adapter_normalizes_unicode_article(self):
        html = """
        <html><head><meta name="description" content="A short summary"></head>
        <body><h1>中文文章</h1><p>2026年08月03日</p>
        <a href="/blog/tag/Python">Python</a><p>正文内容</p></body></html>
        """
        item = _item_from_page("https://example.com/blog/%E4%B8%AD%E6%96%87%E6%96%87%E7%AB%A0", html)
        self.assertEqual(item.title, "中文文章")
        self.assertEqual(item.description, "A short summary")
        self.assertEqual(item.date, "2026-08-03")
        self.assertEqual(item.tags, ["Python"])

    def test_markdown_and_json_are_normalized(self):
        items = load_content("examples/content")
        self.assertEqual(len(items), 4)
        self.assertIn("article", {item.content_type for item in items})
        self.assertTrue(all(item.title for item in items))

    def test_hash_cache_prevents_duplicate_embedding(self):
        items = [ContentItem(id="a", title="A", body="same"), ContentItem(id="b", title="B", body="other")]
        with tempfile.TemporaryDirectory() as directory:
            cache_path = Path(directory) / "embeddings.json"
            provider = CountingProvider()
            build_garden(items, provider=provider, cache=EmbeddingCache(cache_path))
            self.assertEqual(provider.calls, 1)
            build_garden(items, provider=provider, cache=EmbeddingCache(cache_path))
            self.assertEqual(provider.calls, 1)

    def test_cache_key_includes_embedding_dimensions(self):
        items = [ContentItem(id="a", title="A", body="same")]
        with tempfile.TemporaryDirectory() as directory:
            cache_path = Path(directory) / "embeddings.json"
            first = CountingProvider()
            build_garden(items, provider=first, cache=EmbeddingCache(cache_path))
            second = CountingProvider()
            second.dimensions = 16
            build_garden(items, provider=second, cache=EmbeddingCache(cache_path))
            self.assertEqual(first.calls, 1)
            self.assertEqual(second.calls, 1)

    def test_corrupt_cache_is_ignored_and_rebuilt(self):
        items = [ContentItem(id="a", title="A", body="same")]
        with tempfile.TemporaryDirectory() as directory:
            cache_path = Path(directory) / "embeddings.json"
            cache_path.write_text("{not-json", encoding="utf-8")
            provider = CountingProvider()
            build_garden(items, provider=provider, cache=EmbeddingCache(cache_path))
            self.assertEqual(provider.calls, 1)

    def test_output_contract_is_frontend_ready(self):
        items = [ContentItem(id="a", title="A", body="text", url="https://example.com")]
        with tempfile.TemporaryDirectory() as directory:
            garden = build_garden(items, cache=EmbeddingCache(Path(directory) / "embeddings.json"))
        payload = garden.to_dict()
        self.assertIn("nodes", payload)
        self.assertIn("clusters", payload)
        self.assertEqual(payload["nodes"][0]["url"], "https://example.com")
        self.assertIn("reducer_config", payload["metadata"])
        self.assertEqual(payload["metadata"]["reducer_config"]["random_state"], 42)
        self.assertEqual(payload["metadata"]["clusterer_config"]["iterations"], 30)
        json.dumps(payload)

    def test_reducer_points_are_normalized_for_frontend_viewbox(self):
        points = _normalize_points([[100, 200], [150, 500], [300, 250]])
        self.assertTrue(all(-1 <= value <= 1 for point in points for value in point))
        self.assertEqual(len(points), 3)

    def test_skip_if_unchanged_ignores_generation_timestamp(self):
        left = {"generated_at": "2026-01-01", "nodes": [], "clusters": []}
        right = {"generated_at": "2026-02-01", "nodes": [], "clusters": []}
        self.assertTrue(_same_garden(left, right))


if __name__ == "__main__":
    unittest.main()
