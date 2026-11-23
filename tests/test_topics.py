import json
import unittest
from copy import deepcopy
from pathlib import Path

from scripts.apply_case_profile import apply_profile, load_profile


PROFILE = load_profile("examples/zylatent/config.json")


class CategoryMetadataTests(unittest.TestCase):
    def test_source_categories_are_preserved_and_cover_every_node(self):
        garden = {
            "nodes": [
                {"id": "ai", "title": "MCMC", "description": "", "categories": ["解问题"], "tags": ["PyMC"]},
                {"id": "tool", "title": "CLI", "description": "", "categories": ["做东西"], "tags": ["开源"]},
                {"id": "poem", "title": "兰波", "description": "", "categories": ["读作品"], "tags": ["诗歌"]},
            ],
            "clusters": [{"id": 0, "label": "语义簇 01", "node_ids": ["ai", "tool", "poem"], "color": "#a8bd72"}],
            "metadata": {},
        }

        result = apply_profile(deepcopy(garden), PROFILE)

        self.assertEqual({node["id"] for node in result["nodes"]}, {"ai", "tool", "poem"})
        self.assertEqual(result["nodes"][0]["categories"], ["解问题"])
        self.assertNotIn("topic_mode", result["metadata"])
        self.assertNotIn("topic_source", result["metadata"])

    def test_engineering_view_filters_by_source_category(self):
        garden = {
            "nodes": [
                {"id": "build", "title": "工具", "description": "", "categories": ["做东西"]},
                {"id": "solve", "title": "问题", "description": "", "categories": ["解问题"]},
                {"id": "read", "title": "作品", "description": "", "categories": ["读作品"]},
            ],
            "clusters": [{"id": 0, "label": "语义簇 01", "node_ids": ["build", "solve", "read"], "color": "#a8bd72"}],
            "edges": [
                {"source": "build", "target": "solve", "similarity": 0.9},
                {"source": "solve", "target": "read", "similarity": 0.8},
            ],
            "metadata": {},
        }

        result = apply_profile(deepcopy(garden), PROFILE, view="engineering")

        self.assertEqual({node["id"] for node in result["nodes"]}, {"build", "solve"})
        self.assertEqual(result["metadata"]["view"], "engineering")
        self.assertEqual(result["metadata"]["item_count"], 2)
        self.assertEqual(result["edges"], [{"source": "build", "target": "solve", "similarity": 0.9}])

    def test_published_blog_nodes_have_categories_and_safe_targets(self):
        garden = json.loads(Path("frontend/public/garden.json").read_text(encoding="utf-8"))
        self.assertTrue(garden["nodes"])
        self.assertTrue(all(node.get("categories") for node in garden["nodes"]))
        self.assertTrue(all(str(node.get("url", "")).startswith("https://zylatent.com/") for node in garden["nodes"]))
        self.assertEqual(len({cluster["label"] for cluster in garden["clusters"]}), len(garden["clusters"]))


if __name__ == "__main__":
    unittest.main()
