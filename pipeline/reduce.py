from __future__ import annotations

from collections.abc import Sequence
import math


class UMAPReducer:
    name = "umap"

    def __init__(self, random_state: int = 42, n_neighbors: int = 15, min_dist: float = 0.1) -> None:
        if n_neighbors < 2:
            raise ValueError("UMAP n_neighbors must be at least 2")
        if not 0 <= min_dist <= 1:
            raise ValueError("UMAP min_dist must be between 0 and 1")
        self.random_state = random_state
        self.n_neighbors = n_neighbors
        self.min_dist = min_dist

    def fit_transform(self, vectors: Sequence[Sequence[float]]) -> list[list[float]]:
        if not vectors:
            return []
        dimensions = len(vectors[0])
        if dimensions == 0 or any(len(vector) != dimensions for vector in vectors):
            raise ValueError("All embedding vectors must have the same non-zero dimensions")
        if any(not math.isfinite(float(value)) for vector in vectors for value in vector):
            raise ValueError("Embedding vectors must contain finite numbers")
        if len(vectors) < 3:
            return _fallback_projection(vectors)
        try:
            import numpy as np
            import umap

            matrix = np.asarray(vectors, dtype=float)
            neighbors = max(2, min(self.n_neighbors, len(matrix) - 1))
            reducer = umap.UMAP(n_components=2, n_neighbors=neighbors, min_dist=self.min_dist, random_state=self.random_state)
            return reducer.fit_transform(matrix).tolist()
        except ImportError:
            return _fallback_projection(vectors)


def _fallback_projection(vectors: Sequence[Sequence[float]]) -> list[list[float]]:
    """A deterministic projection fallback; production installs should use [analysis]."""
    if not vectors:
        return []
    dimensions = len(vectors[0])
    weights_x = [math.sin(index * 12.9898 + 0.3) for index in range(dimensions)]
    weights_y = [math.cos(index * 78.233 + 1.7) for index in range(dimensions)]
    raw_points = [
        [
            sum(float(value) * weights_x[index] for index, value in enumerate(vector)),
            sum(float(value) * weights_y[index] for index, value in enumerate(vector)),
        ]
        for vector in vectors
    ]
    ranges = []
    for axis in range(2):
        values = [point[axis] for point in raw_points]
        low, high = min(values), max(values)
        ranges.append((low, high))
    return [
        [
            0.0 if high == low else -0.92 + 1.84 * ((point[axis] - low) / (high - low))
            for axis, (low, high) in enumerate(ranges)
        ]
        for point in raw_points
    ]
