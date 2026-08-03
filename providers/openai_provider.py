from __future__ import annotations

import json
import os
from typing import Sequence
from urllib.request import Request, urlopen


class OpenAIEmbeddingProvider:
    """Small stdlib-only OpenAI-compatible provider, activated explicitly by the caller."""

    name = "openai"

    def __init__(self, model: str = "text-embedding-3-small", api_key: str | None = None, dimensions: int = 1536) -> None:
        self.model = model
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        self.dimensions = dimensions
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY is required for OpenAIEmbeddingProvider")

    @property
    def cache_key(self) -> str:
        return f"{self.name}:{self.model}:{self.dimensions}"

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        request = Request(
            "https://api.openai.com/v1/embeddings",
            data=json.dumps({"model": self.model, "input": list(texts)}).encode("utf-8"),
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return [row["embedding"] for row in sorted(payload["data"], key=lambda row: row["index"])]
