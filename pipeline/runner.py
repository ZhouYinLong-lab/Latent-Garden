from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from collections.abc import Sequence
import math

from core.models import ContentItem, Garden, GardenCluster, GardenEdge, GardenNode
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
    points = _normalize_points(reducer.fit_transform(vectors, n_components=2), dimensions=2)
    points_3d = _normalize_points(reducer.fit_transform(vectors, n_components=3), dimensions=3)
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
            id=item.id, title=item.title, description=item.description, tags=item.tags, categories=item.categories, date=item.date,
            url=item.url, content_type=item.content_type, x=point[0], y=point[1],
            x3=point_3d[0], y3=point_3d[1], z3=point_3d[2], cluster_id=label,
            content_hash=item.content_hash,
        )
        for item, point, point_3d, label in zip(items, points, points_3d, labels)
    ]
    edges = _semantic_edges(items, vectors)
    return Garden(
        version="0.2",
        generated_at=datetime.now(timezone.utc).isoformat(),
        dimensions=len(vectors[0]) if vectors else 0,
        reducer=reducer.name,
        clusterer=clusterer.name,
        nodes=nodes,
        clusters=clusters,
        edges=edges,
        metadata={
            "provider": provider.name,
            "item_count": len(items),
            "cluster_count": len(clusters),
            "reducer_config": {
                "n_neighbors": getattr(reducer, "n_neighbors", None),
                "min_dist": getattr(reducer, "min_dist", None),
                "random_state": getattr(reducer, "random_state", None),
                "components_2d": 2,
                "components_3d": 3,
            },
            "clusterer_config": {
                "clusters": getattr(clusterer, "clusters", None),
                "iterations": getattr(clusterer, "iterations", None),
            },
            "edge_config": {"neighbors": 2, "metric": "cosine-embedding"},
        },
    )


def _cluster_label(items: Sequence[ContentItem]) -> str:
    tags = Counter(tag for item in items for tag in item.tags)
    if tags:
        return tags.most_common(1)[0][0]
    return " / ".join(item.title for item in items[:2])


def _normalize_points(points: Sequence[Sequence[float]], dimensions: int | None = None) -> list[list[float]]:
    """Keep every reducer output inside the frontend's stable [-1, 1] contract."""
    if not points:
        return []
    dimensions = dimensions or len(points[0])
    if dimensions < 2 or any(len(point) < dimensions for point in points):
        raise ValueError(f"Reducer must return at least {dimensions}-dimensional points")
    result: list[list[float]] = []
    for axis in range(dimensions):
        values = [float(point[axis]) for point in points]
        if any(not math.isfinite(value) for value in values):
            raise ValueError("Reducer points must contain finite numbers")
        low, high = min(values), max(values)
        span = high - low
        result.append([0.0] * len(points) if span == 0 else [-0.92 + 1.84 * ((value - low) / span) for value in values])
    return [[result[axis][index] for axis in range(dimensions)] for index in range(len(points))]


def _semantic_edges(
    items: Sequence[ContentItem], vectors: Sequence[Sequence[float]], neighbors: int = 2
) -> list[GardenEdge]:
    if len(items) < 2:
        return []

    def cosine(left: Sequence[float], right: Sequence[float]) -> float:
        dot = sum(float(a) * float(b) for a, b in zip(left, right))
        left_norm = math.sqrt(sum(float(value) ** 2 for value in left))
        right_norm = math.sqrt(sum(float(value) ** 2 for value in right))
        return 0.0 if left_norm == 0 or right_norm == 0 else max(-1.0, min(1.0, dot / (left_norm * right_norm)))

    candidates: dict[tuple[str, str], float] = {}
    for index, item in enumerate(items):
        ranked = sorted(
            (
                (cosine(vectors[index], vectors[other_index]), str(other.id))
                for other_index, other in enumerate(items)
                if other_index != index
            ),
            key=lambda candidate: (-candidate[0], candidate[1]),
        )[:neighbors]
        for similarity, target_id in ranked:
            key = tuple(sorted((str(item.id), target_id)))
            candidates[key] = max(similarity, candidates.get(key, -1.0))
    return [
        GardenEdge(source=source, target=target, similarity=round(similarity, 6))
        for (source, target), similarity in sorted(candidates.items())
    ]
