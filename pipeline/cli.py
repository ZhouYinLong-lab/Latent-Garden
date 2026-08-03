from __future__ import annotations

import argparse
import json
from pathlib import Path

from adapters import load_content, load_rss, load_website, load_website_config
from providers.hash_provider import HashEmbeddingProvider
from providers.openai_provider import OpenAIEmbeddingProvider
from .cache import EmbeddingCache
from .cluster import KMeansClusterer
from .reduce import UMAPReducer
from .runner import build_garden


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate an interactive semantic garden JSON file.")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--input", help="A directory or a Markdown/MDX/JSON file")
    source.add_argument("--website", help="A public blog URL, e.g. https://zylatent.com")
    source.add_argument("--rss", help="A local RSS/Atom file or feed URL")
    parser.add_argument("--output", required=True, help="Output garden.json path")
    parser.add_argument("--provider", choices=["hash", "openai"], default="hash")
    parser.add_argument("--cache", default=".latent-garden/embeddings.json")
    parser.add_argument("--openai-model", default="text-embedding-3-small")
    parser.add_argument("--max-pages", type=int, default=6, help="Maximum /blog/N archive pages for --website")
    parser.add_argument("--website-config", help="Optional JSON cleanup/profile config for --website")
    parser.add_argument("--umap-neighbors", type=int, default=15)
    parser.add_argument("--umap-min-dist", type=float, default=0.1)
    parser.add_argument("--clusters", type=int, default=None)
    parser.add_argument("--skip-if-unchanged", action="store_true", help="Keep an existing output if only generated_at changed")
    args = parser.parse_args()
    if args.input:
        items = load_content(args.input)
    elif args.website:
        website_config = load_website_config(args.website_config) if args.website_config else None
        items = load_website(args.website, max_pages=args.max_pages, config=website_config)
    else:
        items = load_rss(args.rss)
    provider = HashEmbeddingProvider() if args.provider == "hash" else OpenAIEmbeddingProvider(model=args.openai_model)
    garden = build_garden(
        items,
        provider=provider,
        cache=EmbeddingCache(args.cache),
        reducer=UMAPReducer(n_neighbors=args.umap_neighbors, min_dist=args.umap_min_dist),
        clusterer=KMeansClusterer(clusters=args.clusters),
    )
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = garden.to_dict()
    if args.skip_if_unchanged and output.exists():
        try:
            previous = json.loads(output.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            previous = None
        if isinstance(previous, dict) and _same_garden(previous, payload):
            print(f"Garden unchanged -> {output}")
            return
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Generated {len(garden.nodes)} nodes and {len(garden.clusters)} clusters -> {output}")


def _same_garden(left: dict, right: dict) -> bool:
    left = dict(left)
    right = dict(right)
    left.pop("generated_at", None)
    right.pop("generated_at", None)
    return left == right


if __name__ == "__main__":
    main()
