from __future__ import annotations

import argparse
import json
from pathlib import Path

from adapters import load_content, load_website
from providers.hash_provider import HashEmbeddingProvider
from providers.openai_provider import OpenAIEmbeddingProvider
from .cache import EmbeddingCache
from .runner import build_garden


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate an interactive semantic garden JSON file.")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--input", help="A directory or a Markdown/MDX/JSON file")
    source.add_argument("--website", help="A public blog URL, e.g. https://zylatent.com")
    parser.add_argument("--output", required=True, help="Output garden.json path")
    parser.add_argument("--provider", choices=["hash", "openai"], default="hash")
    parser.add_argument("--cache", default=".latent-garden/embeddings.json")
    parser.add_argument("--openai-model", default="text-embedding-3-small")
    parser.add_argument("--max-pages", type=int, default=6, help="Maximum /blog/N archive pages for --website")
    args = parser.parse_args()
    items = load_content(args.input) if args.input else load_website(args.website, max_pages=args.max_pages)
    provider = HashEmbeddingProvider() if args.provider == "hash" else OpenAIEmbeddingProvider(model=args.openai_model)
    garden = build_garden(items, provider=provider, cache=EmbeddingCache(args.cache))
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(garden.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Generated {len(garden.nodes)} nodes and {len(garden.clusters)} clusters -> {output}")


if __name__ == "__main__":
    main()
