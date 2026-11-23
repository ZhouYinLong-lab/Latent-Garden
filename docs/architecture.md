# Architecture

Latent Garden is intentionally split at the content boundary:

1. Adapters turn Markdown, MDX, JSON, a public website, RSS, or another source into ContentItem.
2. An EmbeddingProvider turns normalized text into vectors. A provider cache key should include the provider, model, and dimensions.
3. EmbeddingCache stores vectors by content hash and provider cache key, so unchanged content is not embedded again and model changes cannot reuse incompatible vectors.
4. UMAPReducer maps vectors into two dimensions. If optional scientific dependencies are absent, a deterministic projection keeps the demo runnable.
5. UMAP emits independent 2D and 3D coordinates, KMeansClusterer assigns compatibility groups, and cosine similarity creates semantic neighbor edges.
6. An optional case profile can clean site-specific labels, replace topic assignments with an explicitly editorial taxonomy, and produce named subviews. This layer is outside core.
7. The Vite-built WebGL frontend reads garden.json, keeps semantic coordinates fixed, switches between 3D and planar 2D, filters nodes, and exposes article details and original URLs.
8. The optional API serves the same contract, mounts the static frontend, and serializes refreshes behind a configured key.

The blog is only represented by example URLs. It is not imported as a package and is not required at runtime.

The website adapter is intentionally a thin ingestion boundary. It discovers article routes from paginated archive pages, URL-encodes non-ASCII slugs, removes HTML and component boilerplate, deduplicates titles, enforces description quality, and skips pages that cannot pass fetch or quality checks. Site-specific prefixes and description overrides are supplied through an optional JSON config; the adapter does not import the source repository.

## Extension points

An adapter needs to return a list of ContentItem. An embedding provider needs name, dimensions, cache_key, and embed(texts). A reducer needs name and fit_transform(vectors). A clusterer needs name and fit_predict(points).
