# Deployment

## Static-only deployment

The simplest deployment is to publish frontend/ on any static host. Copy a freshly generated garden.json into that directory:

    python -m pipeline.cli --website https://zylatent.com --output frontend/garden.json

Use the frontend directly or embed it with:

    https://your-host.example/frontend/?embed=1&data=/garden.json

## API deployment

Install the API extra:

    pip install -e ".[api]"

Start the service:

    uvicorn api.server:app --host 0.0.0.0 --port 8000

The service exposes:

- GET /health
- GET /garden.json
- GET /api/garden
- POST /api/refresh
- GET /frontend/

The API serves the existing garden file by default. To enable refresh from the public blog, configure:

    LATENT_GARDEN_WEBSITE=https://zylatent.com
    LATENT_GARDEN_REFRESH_TOKEN=replace-me
    LATENT_GARDEN_CORS_ORIGINS=https://zylatent.com

Then refresh with:

    curl -X POST https://garden.example.com/api/refresh -H "X-Latent-Garden-Key: replace-me"

Without LATENT_GARDEN_REFRESH_TOKEN, the refresh endpoint is disabled. Put the API behind HTTPS and an ingress/rate limiter for public use.

## Docker

The repository includes a minimal Dockerfile:

    docker build -t latent-garden .
    docker run --rm -p 8000:8000 latent-garden

To use real UMAP in the container, change the install line to install both API and analysis extras:

    pip install --no-cache-dir ".[api,analysis]"
