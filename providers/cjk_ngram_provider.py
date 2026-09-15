from __future__ import annotations

import hashlib
import math
import re
from typing import Sequence


_CJK_RE = re.compile(r"[\u4e00-\u9fff]+")
_WORD_RE = re.compile(r"[a-z0-9]+(?:[-_][a-z0-9]+)*", re.IGNORECASE)


class CjkNgramEmbeddingProvider:
    """Deterministic, Chinese-aware embedding with no model or API dependency.

    Character bigrams/trigrams preserve overlap between Chinese titles and summaries,
    while word features keep technical English terms such as UMAP and FastAPI intact.
    It is intentionally a transparent fallback, not a claim of model-level semantics.
    """

    name = "cjk-ngram"

    def __init__(self, dimensions: int = 512) -> None:
        self.dimensions = dimensions

    @property
    def cache_key(self) -> str:
        return f"{self.name}:{self.dimensions}:v1"

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        return [self._embed_one(text) for text in texts]

    def _embed_one(self, text: str) -> list[float]:
        vector = [0.0] * self.dimensions
        features: list[tuple[str, float]] = []
        lowered = text.lower()
        for sequence in _CJK_RE.findall(lowered):
            compact = sequence.strip()
            features.extend((f"c2:{compact[index:index + 2]}", 1.8) for index in range(len(compact) - 1))
            features.extend((f"c3:{compact[index:index + 3]}", 2.2) for index in range(len(compact) - 2))
        features.extend((f"w:{word}", 2.8) for word in _WORD_RE.findall(lowered))
        if not features:
            features.append(("empty", 1.0))
        for feature, weight in features:
            digest = hashlib.sha256(feature.encode("utf-8")).digest()
            index = int.from_bytes(digest[:4], "big") % self.dimensions
            sign = 1.0 if digest[4] % 2 else -1.0
            vector[index] += weight * sign
        norm = math.sqrt(sum(value * value for value in vector)) or 1.0
        return [value / norm for value in vector]
