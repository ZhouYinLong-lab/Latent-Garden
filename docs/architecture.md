# Architecture

Latent Garden is intentionally split at the content boundary:

1. Adapters turn Markdown, MDX, JSON, RSS, or another source into ContentItem.
2. An EmbeddingProvider turns normalized text into vectors. The provider name is part of the cache key.
3. EmbeddingCache stores vectors by content hash, so unchanged content is not embedded again.
4. UMAPReducer maps vectors into two dimensions. If optional scientific dependencies are absent, a deterministic projection keeps the demo runnable.
5. KMeansClusterer assigns topic groups and the runner builds the frontend-facing Garden contract.
6. The static frontend reads garden.json, filters nodes, shows metadata, and follows each node's original URL.

The blog is only represented by example URLs. It is not imported as a package and is not required at runtime.

## Extension points

An adapter needs to return a list of ContentItem. An embedding provider needs name, dimensions, and embed(texts). A reducer needs name and fit_transform(vectors). A clusterer needs name and fit_predict(points).
