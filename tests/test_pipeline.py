import json
import tempfile
import unittest
from pathlib import Path

from adapters import load_content
from core.models import ContentItem
from pipeline.cache import EmbeddingCache
from pipeline.runner import build_garden
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

    def test_output_contract_is_frontend_ready(self):
        items = [ContentItem(id="a", title="A", body="text", url="https://example.com")]
        with tempfile.TemporaryDirectory() as directory:
            garden = build_garden(items, cache=EmbeddingCache(Path(directory) / "embeddings.json"))
        payload = garden.to_dict()
        self.assertIn("nodes", payload)
        self.assertIn("clusters", payload)
        self.assertEqual(payload["nodes"][0]["url"], "https://example.com")
        json.dumps(payload)


if __name__ == "__main__":
    unittest.main()
