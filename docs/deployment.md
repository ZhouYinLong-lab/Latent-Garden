# Deployment

## Static hosting

Generate data into Vite's public directory, then build the frontend:

```bash
python -m pipeline.cli --input ./content --output frontend/public/garden.json
npm ci
npm run build
```

Publish `dist/` on any static host. The build uses relative asset URLs, so it works on GitHub Pages, custom domains, and iframe routes.

The included `.github/workflows/pages.yml` uses Node.js 22, runs the production build, and publishes `dist/` after frontend changes or a successful garden refresh.

## API and Docker

The API serves `/health`, `/garden.json`, `/api/garden`, `/api/refresh`, and the built frontend at `/frontend/`.

The Docker image uses a Node build stage and copies `dist/` into the Python runtime image. Defaults:

- `LATENT_GARDEN_GARDEN=/app/frontend/public/garden.json`
- `LATENT_GARDEN_FRONTEND=/app/dist`

Build and run:

```bash
docker build -t latent-garden .
docker run --rm -p 8000:8000 latent-garden
```

To enable refreshes, configure exactly one of `LATENT_GARDEN_INPUT` or `LATENT_GARDEN_WEBSITE` and set `LATENT_GARDEN_REFRESH_TOKEN`.

## Embedding

The frontend preserves these URL parameters:

```text
https://your-host.example/?embed=1&view=engineering
https://your-host.example/?embed=1&data=/api/garden
```
