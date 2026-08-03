# Architecture

Latent Garden is intentionally split at the content boundary:

1. Adapters turn Markdown, MDX, JSON, a public website, RSS, or another source into ContentItem.
2. An EmbeddingProvider turns normalized text into vectors. A provider cache key should include the provider, model, and dimensions.
3. EmbeddingCache stores vectors by content hash and provider cache key, so unchanged content is not embedded again and model changes cannot reuse incompatible vectors.
4. UMAPReducer maps vectors into two dimensions. If optional scientific dependencies are absent, a deterministic projection keeps the demo runnable.
5. KMeansClusterer assigns topic groups and the runner builds the frontend-facing Garden contract.
6. The static frontend reads garden.json, filters nodes, supports zoom/pan, shows metadata, and follows each node's original URL.
7. The optional API serves the same contract, mounts the static frontend, and serializes refreshes behind a configured key.

The blog is only represented by example URLs. It is not imported as a package and is not required at runtime.

The website adapter is intentionally a thin ingestion boundary. It discovers article routes from paginated archive pages, URL-encodes non-ASCII slugs, extracts public metadata and paragraphs, and skips pages that cannot be fetched. It does not assume Astro components or import the blog repository.

## Extension points

An adapter needs to return a list of ContentItem. An embedding provider needs name, dimensions, cache_key, and embed(texts). A reducer needs name and fit_transform(vectors). A clusterer needs name and fit_predict(points).
