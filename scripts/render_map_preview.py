"""Render a dependency-free SVG preview from a garden.json contract."""

from __future__ import annotations

import argparse
import html
import json
import re
from datetime import datetime
from pathlib import Path


WIDTH = 1200
HEIGHT = 720
MAP_LEFT = 64
MAP_TOP = 132
MAP_WIDTH = 820
MAP_HEIGHT = 500
PALETTE = ["#a8bd72", "#d5a36c", "#86a8a1", "#b7a5c8", "#d5a5a1"]
HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def escape(value: object) -> str:
    return html.escape(str(value), quote=True)


def color(value: object, fallback: str) -> str:
    candidate = str(value or "")
    return candidate if HEX_COLOR.fullmatch(candidate) else fallback


def coordinate(value: object, lower: float, upper: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = 0.0
    return max(lower, min(upper, number))


def map_point(value: object, start: float, length: float) -> float:
    normalized = (coordinate(value, -0.92, 0.92) + 0.92) / 1.84
    return start + normalized * length


def generated_label(value: object) -> str:
    if not value:
        return "generated garden"
    try:
        return datetime.fromisoformat(str(value)).date().isoformat()
    except ValueError:
        return str(value)[:10]


def render(garden: dict) -> str:
    nodes = garden.get("nodes", [])
    clusters = garden.get("clusters", [])
    metadata = garden.get("metadata", {})
    cluster_count = len(clusters)
    colors = {
        cluster.get("id"): color(cluster.get("color"), PALETTE[index % len(PALETTE)])
        for index, cluster in enumerate(clusters)
    }

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="title desc">',
        '<title id="title">Latent Garden semantic map for zylatent.com</title>',
        '<desc id="desc">A two-dimensional semantic map of blog articles, colored by topic cluster.</desc>',
        "<defs>",
        '<linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f8f4e5"/><stop offset="1" stop-color="#e0e7cf"/></linearGradient>',
        '<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#697653" flood-opacity=".18"/></filter>',
        f'<clipPath id="map-clip"><rect x="{MAP_LEFT}" y="{MAP_TOP}" width="{MAP_WIDTH}" height="{MAP_HEIGHT}" rx="18"/></clipPath>',
        "</defs>",
        '<rect width="1200" height="720" rx="26" fill="#e8ead8"/>',
        '<rect x="20" y="20" width="1160" height="680" rx="22" fill="url(#paper)" stroke="#c7cdb4" filter="url(#shadow)"/>',
        '<text x="64" y="72" fill="#586347" font-family="Georgia, serif" font-size="38" font-weight="700">Latent Garden<tspan fill="#a4b96f">.</tspan></text>',
        '<text x="66" y="101" fill="#7c8271" font-family="Segoe UI, sans-serif" font-size="13" letter-spacing="2">ZYLATENT.COM · PERSONAL SEMANTIC GARDEN</text>',
        f'<text x="1110" y="72" text-anchor="end" fill="#718650" font-family="Segoe UI, sans-serif" font-size="13">{len(nodes)} nodes · {cluster_count} clusters</text>',
        f'<text x="1110" y="98" text-anchor="end" fill="#7c8271" font-family="Segoe UI, sans-serif" font-size="11">UMAP · {escape(metadata.get("provider", garden.get("reducer", "embedding")))} provider</text>',
        f'<rect x="{MAP_LEFT}" y="{MAP_TOP}" width="{MAP_WIDTH}" height="{MAP_HEIGHT}" rx="18" fill="#f7f3e2" fill-opacity=".64" stroke="#c7cdb4"/>',
        '<g clip-path="url(#map-clip)">',
    ]

    cx = MAP_LEFT + MAP_WIDTH / 2
    cy = MAP_TOP + MAP_HEIGHT / 2
    for rx, ry in ((90, 54), (180, 108), (270, 162), (370, 222)):
        parts.append(f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx}" ry="{ry}" fill="none" stroke="#87986a" stroke-opacity=".18" stroke-width="1"/>')
    parts.extend(
        [
            f'<path d="M {cx:.1f} {MAP_TOP + 18} V {MAP_TOP + MAP_HEIGHT - 18}" stroke="#87986a" stroke-opacity=".12"/>',
            f'<path d="M {MAP_LEFT + 18} {cy:.1f} H {MAP_LEFT + MAP_WIDTH - 18}" stroke="#87986a" stroke-opacity=".12"/>',
        ]
    )

    for node in nodes:
        cluster_id = node.get("cluster_id", 0)
        fill = colors.get(cluster_id, PALETTE[int(cluster_id) % len(PALETTE)] if isinstance(cluster_id, int) else PALETTE[0])
        x = map_point(node.get("x"), MAP_LEFT + 28, MAP_WIDTH - 56)
        y = MAP_TOP + MAP_HEIGHT - 28 - map_point(node.get("y"), 0, MAP_HEIGHT - 56)
        title = escape(node.get("title", node.get("id", "untitled")))
        parts.append(f'<g><title>{title}</title><circle cx="{x:.2f}" cy="{y:.2f}" r="7" fill="{fill}" fill-opacity=".92" stroke="#f7f3e2" stroke-width="2"/><circle cx="{x:.2f}" cy="{y:.2f}" r="12" fill="none" stroke="{fill}" stroke-opacity=".18"/></g>')

    parts.append('</g>')

    parts.extend(
        [
            '<text x="930" y="168" fill="#586347" font-family="Georgia, serif" font-size="22" font-weight="700">主题 clusters</text>',
            '<text x="930" y="194" fill="#7c8271" font-family="Segoe UI, sans-serif" font-size="12">相近节点代表相近的内容语义</text>',
        ]
    )
    for index, cluster in enumerate(clusters):
        y = 238 + index * 52
        cluster_id = cluster.get("id", index)
        fill = colors.get(cluster_id, PALETTE[index % len(PALETTE)])
        label = escape(cluster.get("label", f"Cluster {cluster_id}"))
        count = len(cluster.get("node_ids", []))
        parts.append(f'<circle cx="936" cy="{y - 5}" r="7" fill="{fill}"/><text x="956" y="{y}" fill="#4c5141" font-family="Segoe UI, sans-serif" font-size="14">主题 {index + 1} · {label}</text><text x="956" y="{y + 19}" fill="#7c8271" font-family="Segoe UI, sans-serif" font-size="11">{count} 篇内容</text>')

    parts.extend(
        [
            '<text x="66" y="666" fill="#7c8271" font-family="Segoe UI, sans-serif" font-size="11">position = reduced embedding coordinate · colors = topic clusters · hover/click in the interactive frontend</text>',
            f'<text x="1110" y="666" text-anchor="end" fill="#7c8271" font-family="Segoe UI, sans-serif" font-size="11">snapshot: {escape(generated_label(garden.get("generated_at")))}</text>',
            "</svg>",
        ]
    )
    return "\n".join(parts) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="path to garden.json")
    parser.add_argument("output", type=Path, help="path to the SVG preview")
    args = parser.parse_args()
    garden = json.loads(args.input.read_text(encoding="utf-8"))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(render(garden), encoding="utf-8")


if __name__ == "__main__":
    main()
