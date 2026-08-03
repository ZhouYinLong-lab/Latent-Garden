FROM python:3.11-slim

WORKDIR /app
COPY . .

RUN pip install --no-cache-dir ".[api]"

ENV LATENT_GARDEN_GARDEN=/app/frontend/garden.json
ENV LATENT_GARDEN_FRONTEND=/app/frontend
EXPOSE 8000

CMD ["uvicorn", "api.server:app", "--host", "0.0.0.0", "--port", "8000"]
