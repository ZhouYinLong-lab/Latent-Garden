"""Apply an optional editorial case profile without coupling it to Latent Garden core."""

from __future__ import annotations

import argparse
from copy import deepcopy
import json
from pathlib import Path


def load_profile(path: str | Path) -> dict:
    profile = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(profile, dict) or not isinstance(profile.get("topics"), list):
        raise ValueError("Case profile must contain a topics array")
    return profile


def apply_profile(garden: dict, profile: dict, view: str = "full") -> dict:
    result = deepcopy(garden)
    topics = profile.get("topics", [])
    topic_by_id = {int(topic["id"]): topic for topic in topics}
    if not topic_by_id:
        raise ValueError("Case profile must define at least one topic")
    match_order = [int(value) for value in profile.get("match_order", topic_by_id)]
    default_topic_id = int(profile.get("default_topic_id", next(iter(topic_by_id))))
    if default_topic_id not in topic_by_id or any(topic_id not in topic_by_id for topic_id in match_order):
        raise ValueError("Case profile references an unknown topic id")

    views = profile.get("views", {})
    if view not in views:
        raise ValueError(f"Unknown case view: {view}")
    view_config = views[view]
    allowed_topics = {int(value) for value in view_config.get("topic_ids", topic_by_id)}

    classified_nodes = []
    for node in result.get("nodes", []):
        searchable = " ".join(
            [str(node.get("id", "")), str(node.get("title", "")), str(node.get("description", ""))]
            + [str(tag) for tag in node.get("tags", [])]
        ).lower()
        topic_id = default_topic_id
        for candidate in match_order:
            keywords = [str(value).lower() for value in topic_by_id[candidate].get("keywords", [])]
            if any(keyword in searchable for keyword in keywords):
                topic_id = candidate
                break
        node["cluster_id"] = topic_id
        if topic_id in allowed_topics:
            classified_nodes.append(node)

    result["nodes"] = classified_nodes
    members = {topic_id: [] for topic_id in allowed_topics}
    for node in classified_nodes:
        members[node["cluster_id"]].append(node.get("id"))
    result["clusters"] = [
        {
            "id": int(topic["id"]),
            "label": topic["label"],
            "node_ids": members[int(topic["id"])],
            "color": topic["color"],
        }
        for topic in topics
        if int(topic["id"]) in allowed_topics and members[int(topic["id"])]
    ]
    result["clusterer"] = "curated-keywords"
    metadata = result.setdefault("metadata", {})
    metadata.update(
        {
            "item_count": len(classified_nodes),
            "cluster_count": len(result["clusters"]),
            "topic_mode": "curated",
            "topic_source": f"{profile.get('name', 'case')} editorial taxonomy",
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
    metadata.setdefault("reducer_config", {"n_neighbors": 15, "min_dist": 0.1, "random_state": 42})
    metadata["edge_config"] = {"neighbors": 2, "max_second_distance": 0.48, "metric": "euclidean-2d"}
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
