FROM node:22-alpine AS frontend-build

WORKDIR /app
COPY package.json package-lock.json vite.config.js ./
RUN npm ci
COPY frontend ./frontend
RUN npm run build

FROM python:3.11-slim

WORKDIR /app
COPY . .
COPY --from=frontend-build /app/dist /app/dist

RUN pip install --no-cache-dir ".[api]"

ENV LATENT_GARDEN_GARDEN=/app/frontend/public/garden.json
ENV LATENT_GARDEN_FRONTEND=/app/dist
EXPOSE 8000

CMD ["uvicorn", "api.server:app", "--host", "0.0.0.0", "--port", "8000"]
