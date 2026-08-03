from __future__ import annotations

from typing import Protocol, Sequence


class EmbeddingProvider(Protocol):
    """Replaceable embedding contract. Implement one method to add a provider."""

    name: str
    dimensions: int

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        ...
