"""Carry stable local cover references across regenerated garden snapshots."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def _cover_index(payload: dict) -> dict[str, str]:
    index: dict[str, str] = {}
    for node in payload.get("nodes", []):
        cover = node.get("cover")
        if not isinstance(cover, str) or not cover.lower().endswith(".webp"):
            continue
        for key in (node.get("id"), node.get("url")):
            if key:
                index[str(key)] = cover
    return index


def preserve_cover_refs(previous: dict, current: dict) -> int:
    """Copy WebP cover paths for nodes whose id or URL remains stable."""
    index = _cover_index(previous)
    copied = 0
    for node in current.get("nodes", []):
        if node.get("cover"):
            continue
        cover = index.get(str(node.get("id"))) or index.get(str(node.get("url")))
        if cover:
            node["cover"] = cover
            copied += 1
    return copied


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("previous", type=Path)
    parser.add_argument("current", type=Path)
    args = parser.parse_args()

    previous = json.loads(args.previous.read_text(encoding="utf-8"))
    current = json.loads(args.current.read_text(encoding="utf-8"))
    copied = preserve_cover_refs(previous, current)
    args.current.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Preserved {copied} local cover reference(s).")


if __name__ == "__main__":
    main()
