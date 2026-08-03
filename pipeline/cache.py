from __future__ import annotations

import json
from pathlib import Path
from typing import Sequence
import warnings


class EmbeddingCache:
    """Content-hash cache persisted as a human-readable JSON file."""

    VERSION = 1

    def __init__(self, path: str | Path = ".latent-garden/embeddings.json") -> None:
        self.path = Path(path)
        self._data: dict[str, list[float]] = {}
        if self.path.exists():
            try:
                raw = json.loads(self.path.read_text(encoding="utf-8"))
                items = raw.get("items") if isinstance(raw, dict) and isinstance(raw.get("items"), dict) else raw
                if isinstance(items, dict):
                    self._data = {
                        str(key): [float(value) for value in vector]
                        for key, vector in items.items()
                        if isinstance(vector, list)
                    }
            except (OSError, json.JSONDecodeError, TypeError, ValueError):
                warnings.warn(f"Ignoring unreadable embedding cache: {self.path}", RuntimeWarning, stacklevel=2)

    def get(self, content_hash: str, provider_name: str) -> list[float] | None:
        return self._data.get(f"{provider_name}:{content_hash}")

    def set(self, content_hash: str, provider_name: str, vector: Sequence[float]) -> None:
        self._data[f"{provider_name}:{content_hash}"] = [float(value) for value in vector]

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"version": self.VERSION, "items": self._data}
        temporary = self.path.with_suffix(self.path.suffix + ".tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(self.path)
