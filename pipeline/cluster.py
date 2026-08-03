from __future__ import annotations

from collections.abc import Sequence
import math


class KMeansClusterer:
    name = "kmeans"

    def __init__(self, clusters: int | None = None, iterations: int = 30) -> None:
        if clusters is not None and clusters < 1:
            raise ValueError("clusters must be at least 1")
        if iterations < 1:
            raise ValueError("iterations must be at least 1")
        self.clusters = clusters
        self.iterations = iterations

    def fit_predict(self, points: Sequence[Sequence[float]]) -> list[int]:
        count = len(points)
        if count == 0:
            return []
        if count == 1:
            return [0]
        k = max(1, min(self.clusters or max(2, round(math.sqrt(count / 2))), count))
        centers = [list(points[index]) for index in [round(i * (count - 1) / max(1, k - 1)) for i in range(k)]]
        labels = [-1] * count
        for _ in range(self.iterations):
            next_labels = [min(range(k), key=lambda center: _distance(point, centers[center])) for point in points]
            if next_labels == labels:
                break
            labels = next_labels
            for center_index in range(k):
                members = [point for point, label in zip(points, labels) if label == center_index]
                if members:
                    centers[center_index] = [sum(values) / len(members) for values in zip(*members)]
        return labels


def _distance(left: Sequence[float], right: Sequence[float]) -> float:
    return sum((a - b) ** 2 for a, b in zip(left, right))
