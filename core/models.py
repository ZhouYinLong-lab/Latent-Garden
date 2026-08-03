from __future__ import annotations

from dataclasses import asdict, dataclass, field
from hashlib import sha256
import json
from typing import Any


@dataclass(slots=True)
class ContentItem:
    """Normalized content record shared by all adapters."""

    id: str
    title: str
    body: str
    description: str = ""
    tags: list[str] = field(default_factory=list)
    date: str | None = None
    url: str | None = None
    content_type: str = "document"
    source_path: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def content_hash(self) -> str:
        payload = {
            "title": self.title,
            "description": self.description,
            "body": self.body,
            "tags": self.tags,
            "date": self.date,
            "url": self.url,
            "content_type": self.content_type,
        }
        encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
        return sha256(encoded).hexdigest()

    def to_dict(self) -> dict[str, Any]:
        return asdict(self) | {"content_hash": self.content_hash}


@dataclass(slots=True)
class GardenNode:
    id: str
    title: str
    description: str
    tags: list[str]
    date: str | None
    url: str | None
    content_type: str
    x: float
    y: float
    cluster_id: int
    content_hash: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class GardenCluster:
    id: int
    label: str
    node_ids: list[str]
    color: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class Garden:
    version: str
    generated_at: str
    dimensions: int
    reducer: str
    clusterer: str
    nodes: list[GardenNode]
    clusters: list[GardenCluster]
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "generated_at": self.generated_at,
            "dimensions": self.dimensions,
            "reducer": self.reducer,
            "clusterer": self.clusterer,
            "nodes": [node.to_dict() for node in self.nodes],
            "clusters": [cluster.to_dict() for cluster in self.clusters],
            "metadata": self.metadata,
        }
