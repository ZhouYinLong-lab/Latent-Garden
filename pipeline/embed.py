from __future__ import annotations

from collections.abc import Sequence

from core.models import ContentItem
from providers.base import EmbeddingProvider
from .cache import EmbeddingCache


def embed_items(items: Sequence[ContentItem], provider: EmbeddingProvider, cache: EmbeddingCache | None = None) -> list[list[float]]:
    cache = cache or EmbeddingCache()
    provider_key = getattr(provider, "cache_key", f"{provider.name}:{provider.dimensions}")
    vectors: list[list[float] | None] = [cache.get(item.content_hash, provider_key) for item in items]
    missing_indices = [index for index, vector in enumerate(vectors) if vector is None]
    if missing_indices:
        texts = [f"{items[index].title}\n{items[index].description}\n{items[index].body}\n{' '.join(items[index].tags)}" for index in missing_indices]
        generated = provider.embed(texts)
        if len(generated) != len(missing_indices):
            raise ValueError("EmbeddingProvider returned an unexpected number of vectors")
        for index, vector in zip(missing_indices, generated):
            if len(vector) != provider.dimensions:
                raise ValueError(f"EmbeddingProvider returned {len(vector)} dimensions; expected {provider.dimensions}")
            cache.set(items[index].content_hash, provider_key, vector)
            vectors[index] = list(vector)
        cache.save()
    return [vector or [] for vector in vectors]
