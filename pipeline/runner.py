from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from collections.abc import Sequence
import math

from core.models import ContentItem, Garden, GardenCluster, GardenNode
from providers.base import EmbeddingProvider
from providers.hash_provider import HashEmbeddingProvider
from .cache import EmbeddingCache
from .cluster import KMeansClusterer
from .embed import embed_items
from .reduce import UMAPReducer


PALETTE = ["#a8bd72", "#d5a36c", "#86a8a1", "#b7a5c8", "#d5a5a1", "#c7b46b", "#87a995", "#c7976c"]


def build_garden(
    items: Sequence[ContentItem],
    provider: EmbeddingProvider | None = None,
    cache: EmbeddingCache | None = None,
    reducer: UMAPReducer | None = None,
    clusterer: KMeansClusterer | None = None,
) -> Garden:
    provider = provider or HashEmbeddingProvider()
    reducer = reducer or UMAPReducer()
    clusterer = clusterer or KMeansClusterer()
    vectors = embed_items(items, provider, cache)
    points = _normalize_points(reducer.fit_transform(vectors))
    labels = clusterer.fit_predict(points)
    grouped: dict[int, list[ContentItem]] = {}
    for item, label in zip(items, labels):
        grouped.setdefault(label, []).append(item)
    clusters = [
        GardenCluster(id=label, label=_cluster_label(group), node_ids=[item.id for item in group], color=PALETTE[label % len(PALETTE)])
        for label, group in sorted(grouped.items())
    ]
    nodes = [
        GardenNode(
            id=item.id, title=item.title, description=item.description, tags=item.tags, date=item.date,
            url=item.url, content_type=item.content_type, x=point[0], y=point[1], cluster_id=label,
            content_hash=item.content_hash,
        )
        for item, point, label in zip(items, points, labels)
    ]
    return Garden(
        version="0.1",
        generated_at=datetime.now(timezone.utc).isoformat(),
        dimensions=len(vectors[0]) if vectors else 0,
        reducer=reducer.name,
        clusterer=clusterer.name,
        nodes=nodes,
        clusters=clusters,
        metadata={
            "provider": provider.name,
            "item_count": len(items),
            "cluster_count": len(clusters),
            "reducer_config": {
                "n_neighbors": getattr(reducer, "n_neighbors", None),
                "min_dist": getattr(reducer, "min_dist", None),
            },
            "clusterer_config": {"clusters": getattr(clusterer, "clusters", None)},
        },
    )


def _cluster_label(items: Sequence[ContentItem]) -> str:
    tags = Counter(tag for item in items for tag in item.tags)
    if tags:
        return tags.most_common(1)[0][0]
    return " / ".join(item.title for item in items[:2])


def _normalize_points(points: Sequence[Sequence[float]]) -> list[list[float]]:
    """Keep every reducer output inside the frontend's stable [-1, 1] contract."""
    if not points:
        return []
    if any(len(point) < 2 for point in points):
        raise ValueError("Reducer must return two-dimensional points")
    result: list[list[float]] = []
    for axis in range(2):
        values = [float(point[axis]) for point in points]
        if any(not math.isfinite(value) for value in values):
            raise ValueError("Reducer points must contain finite numbers")
        low, high = min(values), max(values)
        span = high - low
        result.append([0.0] * len(points) if span == 0 else [-0.92 + 1.84 * ((value - low) / span) for value in values])
    return [[result[0][index], result[1][index]] for index in range(len(points))]
