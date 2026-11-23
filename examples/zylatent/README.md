# zylatent.com case profile

This directory contains the first real Latent Garden case, not core product configuration.

- `config.json` defines website cleanup, source categories, and named views.
- `garden.json` is the complete public-content snapshot.
- `engineering-garden.json` keeps the `做东西` and `解问题` categories for a technical view.

The semantic coordinates and K-Means regions come from the generic pipeline. Categories and tags are source metadata carried into each node; `scripts/apply_case_profile.py` only applies presentation and named-view filtering.

Generate both views:

```bash
python -m pipeline.cli \
  --website https://zylatent.com \
  --website-config examples/zylatent/config.json \
  --output .latent-garden/zylatent-raw.json \
  --provider sentence-transformers \
  --embedding-model BAAI/bge-small-zh-v1.5 \
  --cache .latent-garden/zylatent-embeddings.json
python scripts/apply_case_profile.py \
  .latent-garden/zylatent-raw.json examples/zylatent/config.json \
  --view full --output examples/zylatent/garden.json
python scripts/apply_case_profile.py \
  .latent-garden/zylatent-raw.json examples/zylatent/config.json \
  --view engineering --output examples/zylatent/engineering-garden.json
```
