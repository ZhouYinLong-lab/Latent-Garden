from __future__ import annotations

import json
from pathlib import Path
from typing import Sequence


class EmbeddingCache:
    """Content-hash cache persisted as a human-readable JSON file."""

    def __init__(self, path: str | Path = ".latent-garden/embeddings.json") -> None:
        self.path = Path(path)
        self._data: dict[str, list[float]] = {}
        if self.path.exists():
            self._data = json.loads(self.path.read_text(encoding="utf-8"))

    def get(self, content_hash: str, provider_name: str) -> list[float] | None:
        return self._data.get(f"{provider_name}:{content_hash}")

    def set(self, content_hash: str, provider_name: str, vector: Sequence[float]) -> None:
        self._data[f"{provider_name}:{content_hash}"] = [float(value) for value in vector]

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self._data, ensure_ascii=False, indent=2), encoding="utf-8")
