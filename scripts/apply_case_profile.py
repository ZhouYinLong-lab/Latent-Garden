"""Apply case presentation and named views without inventing editorial topics."""

from __future__ import annotations

import argparse
from copy import deepcopy
import json
from pathlib import Path


def load_profile(path: str | Path) -> dict:
    profile = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(profile, dict) or not isinstance(profile.get("views"), dict):
        raise ValueError("Case profile must contain a views object")
    return profile


def apply_profile(garden: dict, profile: dict, view: str = "full") -> dict:
    result = deepcopy(garden)
    views = profile.get("views", {})
    if view not in views:
        raise ValueError(f"Unknown case view: {view}")
    view_config = views[view]
    allowed_categories = {str(value) for value in view_config.get("categories", profile.get("categories", []))}
    allowed_node_ids = {str(value) for value in view_config.get("node_ids", [])}

    filtered_nodes = []
    for node in result.get("nodes", []):
        node["categories"] = [str(value) for value in node.get("categories", [])]
        matches_category = not allowed_categories or bool(allowed_categories.intersection(node["categories"]))
        matches_id = not allowed_node_ids or str(node.get("id")) in allowed_node_ids
        if matches_category and matches_id:
            filtered_nodes.append(node)
    result["nodes"] = filtered_nodes
    allowed_ids = {str(node.get("id")) for node in filtered_nodes}
    result["edges"] = [
        edge
        for edge in result.get("edges", [])
        if str(edge.get("source")) in allowed_ids and str(edge.get("target")) in allowed_ids
    ]
    for cluster in result.get("clusters", []):
        cluster["node_ids"] = [node_id for node_id in cluster.get("node_ids", []) if str(node_id) in allowed_ids]
    result["clusters"] = [cluster for cluster in result.get("clusters", []) if cluster.get("node_ids")]
    for index, cluster in enumerate(result["clusters"], start=1):
        cluster["label"] = f"语义簇 {index:02d}"
    metadata = result.setdefault("metadata", {})
    metadata.pop("topic_mode", None)
    metadata.pop("topic_source", None)
    metadata.update(
        {
            "item_count": len(filtered_nodes),
            "cluster_count": len(result["clusters"]),
            "case_profile": profile.get("name", "case"),
            "view": view,
            "view_label": view_config.get("label", view),
            "available_views": [
                {
                    "id": view_id,
                    "label": config.get("label", view_id),
                    "data": config.get("data"),
                }
                for view_id, config in views.items()
            ],
            "presentation": deepcopy(profile.get("presentation", {})),
        }
    )
    metadata.setdefault(
        "reducer_config",
        {"n_neighbors": 15, "min_dist": 0.1, "random_state": 42, "components_2d": 2, "components_3d": 3},
    )
    metadata["edge_config"] = {"neighbors": 2, "metric": "cosine-embedding"}
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("garden", type=Path, help="input garden.json")
    parser.add_argument("profile", type=Path, help="case profile JSON")
    parser.add_argument("--view", default="full", help="named view from the profile")
    parser.add_argument("--output", type=Path, help="output path; defaults to overwriting the input")
    args = parser.parse_args()
    payload = json.loads(args.garden.read_text(encoding="utf-8"))
    output = args.output or args.garden
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(apply_profile(payload, load_profile(args.profile), view=args.view), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
