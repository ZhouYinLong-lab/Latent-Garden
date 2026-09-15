from __future__ import annotations

from collections.abc import Sequence


class SentenceTransformerEmbeddingProvider:
    """Local transformer embeddings for semantic maps.

    The dependency is imported lazily so the base package remains lightweight;
    install the ``embeddings`` extra before selecting this provider.
    """

    name = "sentence-transformers"

    def __init__(
        self,
        model_name: str = "BAAI/bge-small-zh-v1.5",
        device: str | None = None,
        batch_size: int = 32,
    ) -> None:
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise RuntimeError(
                "SentenceTransformerEmbeddingProvider requires the 'embeddings' extra "
                "(pip install 'latent-garden[embeddings]')."
            ) from exc

        self.model_name = model_name
        self.batch_size = batch_size
        self.model = SentenceTransformer(model_name, device=device)
        get_dimension = getattr(self.model, "get_embedding_dimension", self.model.get_sentence_embedding_dimension)
        self.dimensions = int(get_dimension())

    @property
    def cache_key(self) -> str:
        return f"{self.name}:{self.model_name}:{self.dimensions}"

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        embeddings = self.model.encode(
            list(texts),
            batch_size=self.batch_size,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return [[float(value) for value in row] for row in embeddings.tolist()]
