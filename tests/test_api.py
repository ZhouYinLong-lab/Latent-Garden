import json
import tempfile
import unittest
from pathlib import Path

try:
    from fastapi.testclient import TestClient
    from api.server import ApiSettings, create_app
    API_AVAILABLE = True
except ImportError:
    API_AVAILABLE = False


@unittest.skipUnless(API_AVAILABLE, "API extra is not installed")
class ApiTests(unittest.TestCase):
    def test_read_endpoints_serve_garden_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            garden_path = Path(directory) / "garden.json"
            garden_path.write_text(json.dumps({"nodes": [], "clusters": [], "version": "0.1"}), encoding="utf-8")
            client = TestClient(create_app(ApiSettings(garden_path=garden_path, frontend_path=None)))
            self.assertEqual(client.get("/health").json()["ok"], True)
            self.assertEqual(client.get("/api/garden").status_code, 200)

    def test_refresh_requires_key_and_writes_new_garden(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "items.json"
            source.write_text(json.dumps([{"id": "one", "title": "One", "content": "A note"}]), encoding="utf-8")
            settings = ApiSettings(
                garden_path=root / "garden.json",
                input_path=str(source),
                cache_path=root / "cache.json",
                frontend_path=None,
                refresh_token="secret",
            )
            client = TestClient(create_app(settings))
            self.assertEqual(client.post("/api/refresh").status_code, 401)
            disabled = ApiSettings(
                garden_path=root / "disabled.json",
                input_path=str(source),
                cache_path=root / "disabled-cache.json",
                frontend_path=None,
            )
            self.assertEqual(TestClient(create_app(disabled)).post("/api/refresh").status_code, 403)
            response = client.post("/api/refresh", headers={"X-Latent-Garden-Key": "secret"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(len(response.json()["garden"]["nodes"]), 1)


if __name__ == "__main__":
    unittest.main()
