import unittest

from scripts.render_map_preview import render


class PreviewTests(unittest.TestCase):
    def test_preview_contains_clipped_map_and_topic_legend(self):
        garden = {
            "generated_at": "2026-08-03T00:00:00+00:00",
            "reducer": "umap",
            "metadata": {"provider": "hash"},
            "nodes": [{"id": "one", "title": "One", "x": 0.9, "y": -0.9, "cluster_id": 0}],
            "clusters": [{"id": 0, "label": "Example", "node_ids": ["one"], "color": "#a8bd72"}],
        }

        svg = render(garden)

        self.assertIn('id="map-clip"', svg)
        self.assertIn('clip-path="url(#map-clip)"', svg)
        self.assertIn("<ellipse", svg)
        self.assertIn("Example", svg)


if __name__ == "__main__":
    unittest.main()
