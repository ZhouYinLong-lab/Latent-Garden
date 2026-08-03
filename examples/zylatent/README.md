# zylatent.com case profile

This directory contains the first real Latent Garden case, not core product configuration.

- `config.json` defines website cleanup, editorial topic rules, colors, and named views.
- `garden.json` is the complete public-content snapshot.
- `engineering-garden.json` keeps the AI, software/tooling, and interactive-project topics.

The semantic coordinates still come from the provider and reducer selected by the generic pipeline. The five topic labels are an editorial layer applied afterward by `scripts/apply_case_profile.py`.

Generate both views:

```bash
python -m pipeline.cli \
  --website https://zylatent.com \
  --website-config examples/zylatent/config.json \
  --output .latent-garden/zylatent-raw.json \
  --cache .latent-garden/zylatent-embeddings.json
python scripts/apply_case_profile.py \
  .latent-garden/zylatent-raw.json examples/zylatent/config.json \
  --view full --output examples/zylatent/garden.json
python scripts/apply_case_profile.py \
  .latent-garden/zylatent-raw.json examples/zylatent/config.json \
  --view engineering --output examples/zylatent/engineering-garden.json
```
