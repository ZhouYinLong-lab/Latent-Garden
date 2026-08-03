"""Apply a small editorial topic taxonomy to the zylatent.com example map."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


TOPICS = [
    {
        "id": 0,
        "label": "智能与计算",
        "color": "#9fb46b",
        "keywords": [
            "python", "fastapi", "人工智能", "对抗搜索", "minimax", "alpha-beta", "mcts",
            "贝叶斯", "mcmc", "pymc", "数学建模", "概率编程", "c++", "内存管理",
            "六人定律", "社会网络",
        ],
    },
    {
        "id": 1,
        "label": "工具与开源",
        "color": "#86a8a1",
        "keywords": [
            "bash", "cli", "工具", "自动化", "claude code", "skill", "mkdocs", "文档",
            "ci/cd", "开源", "项目回顾", "教程",
        ],
    },
    {
        "id": 2,
        "label": "互动实验",
        "color": "#d5a36c",
        "keywords": [
            "javascript", "密码学", "web crypto", "加密", "互动网页", "godot", "自走棋",
            "游戏", "凡人修仙传", "夜空", "大庚剑阵",
        ],
    },
    {
        "id": 3,
        "label": "诗歌与文学",
        "color": "#b7a5c8",
        "keywords": ["兰波", "海子", "诗歌", "书评", "挽救计划"],
    },
    {
        "id": 4,
        "label": "影像与见闻",
        "color": "#d5a5a1",
        "keywords": [],
    },
]

# More specific project formats win before broad technical or literary matches.
MATCH_ORDER = [1, 2, 0, 3]


def curate(garden: dict) -> dict:
    nodes = garden.get("nodes", [])
    members = {topic["id"]: [] for topic in TOPICS}
    topic_by_id = {topic["id"]: topic for topic in TOPICS}

    for node in nodes:
        searchable = " ".join(
            [str(node.get("id", "")), str(node.get("title", "")), str(node.get("description", ""))]
            + [str(tag) for tag in node.get("tags", [])]
        ).lower()
        topic_id = 4
        for candidate in MATCH_ORDER:
            if any(keyword in searchable for keyword in topic_by_id[candidate]["keywords"]):
                topic_id = candidate
                break
        node["cluster_id"] = topic_id
        members[topic_id].append(node.get("id"))

    garden["clusters"] = [
        {
            "id": topic["id"],
            "label": topic["label"],
            "node_ids": members[topic["id"]],
            "color": topic["color"],
        }
        for topic in TOPICS
        if members[topic["id"]]
    ]
    metadata = garden.setdefault("metadata", {})
    metadata["cluster_count"] = len(garden["clusters"])
    metadata["topic_mode"] = "curated"
    metadata["topic_source"] = "zylatent.com editorial taxonomy"
    return garden


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("garden", type=Path, help="path to the zylatent garden.json")
    args = parser.parse_args()
    payload = json.loads(args.garden.read_text(encoding="utf-8"))
    args.garden.write_text(
        json.dumps(curate(payload), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
