import json
import unittest
from pathlib import Path

from scripts.curate_zylatent_topics import TOPICS, curate


class TopicCurationTests(unittest.TestCase):
    def test_curated_topics_are_unique_and_cover_every_node(self):
        garden = {
            "nodes": [
                {"id": "ai", "title": "MCMC", "description": "", "tags": ["PyMC"]},
                {"id": "tool", "title": "CLI", "description": "", "tags": ["开源"]},
                {"id": "web", "title": "互动", "description": "", "tags": ["互动网页"]},
                {"id": "poem", "title": "兰波", "description": "", "tags": ["诗歌"]},
                {"id": "life", "title": "济南", "description": "", "tags": ["游记"]},
            ],
            "clusters": [],
            "metadata": {},
        }

        result = curate(garden)

        labels = [cluster["label"] for cluster in result["clusters"]]
        self.assertEqual(labels, [topic["label"] for topic in TOPICS])
        self.assertEqual(len(labels), len(set(labels)))
        self.assertEqual({node["cluster_id"] for node in result["nodes"]}, {0, 1, 2, 3, 4})
        self.assertEqual(result["clusterer"], "curated-keywords")
        self.assertEqual(result["metadata"]["topic_mode"], "curated")
        self.assertEqual(result["metadata"]["reducer_config"]["n_neighbors"], 15)
        self.assertEqual(result["metadata"]["edge_config"]["metric"], "euclidean-2d")

    def test_published_blog_nodes_all_have_safe_targets(self):
        garden = json.loads(Path("frontend/garden.json").read_text(encoding="utf-8"))
        self.assertTrue(garden["nodes"])
        self.assertTrue(all(str(node.get("url", "")).startswith("https://zylatent.com/") for node in garden["nodes"]))
        self.assertEqual(len({cluster["label"] for cluster in garden["clusters"]}), len(garden["clusters"]))


if __name__ == "__main__":
    unittest.main()
