from __future__ import annotations

import argparse
import json
from pathlib import Path

from adapters import load_content
from providers.hash_provider import HashEmbeddingProvider
from providers.openai_provider import OpenAIEmbeddingProvider
from .cache import EmbeddingCache
from .runner import build_garden


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate an interactive semantic garden JSON file.")
    parser.add_argument("--input", required=True, help="A directory or a Markdown/MDX/JSON file")
    parser.add_argument("--output", required=True, help="Output garden.json path")
    parser.add_argument("--provider", choices=["hash", "openai"], default="hash")
    parser.add_argument("--cache", default=".latent-garden/embeddings.json")
    parser.add_argument("--openai-model", default="text-embedding-3-small")
    args = parser.parse_args()
    items = load_content(args.input)
    provider = HashEmbeddingProvider() if args.provider == "hash" else OpenAIEmbeddingProvider(model=args.openai_model)
    garden = build_garden(items, provider=provider, cache=EmbeddingCache(args.cache))
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(garden.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Generated {len(garden.nodes)} nodes and {len(garden.clusters)} clusters -> {output}")


if __name__ == "__main__":
    main()
