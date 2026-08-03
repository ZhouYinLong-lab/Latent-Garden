from __future__ import annotations

from dataclasses import dataclass, field
import json
import os
from pathlib import Path
import secrets
from threading import Lock
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from adapters import load_content, load_website
from pipeline.cache import EmbeddingCache
from pipeline.cluster import KMeansClusterer
from pipeline.reduce import UMAPReducer
from pipeline.runner import build_garden
from providers.hash_provider import HashEmbeddingProvider
from providers.openai_provider import OpenAIEmbeddingProvider


PROJECT_ROOT = Path(__file__).resolve().parents[1]
_refresh_lock = Lock()


def _configured_path(value: str | None, default: Path) -> Path:
    path = Path(value) if value else default
    return path if path.is_absolute() else PROJECT_ROOT / path


@dataclass(slots=True)
class ApiSettings:
    garden_path: Path = field(default_factory=lambda: PROJECT_ROOT / "frontend" / "garden.json")
    input_path: str | None = None
    website: str | None = None
    provider: str = "hash"
    openai_model: str = "text-embedding-3-small"
    cache_path: Path = field(default_factory=lambda: PROJECT_ROOT / ".latent-garden" / "api-embeddings.json")
    max_pages: int = 6
    umap_neighbors: int = 15
    umap_min_dist: float = 0.1
    clusters: int | None = None
    frontend_path: Path | None = field(default_factory=lambda: PROJECT_ROOT / "frontend")
    refresh_token: str | None = None
    cors_origins: list[str] = field(default_factory=lambda: ["*"])

    @classmethod
    def from_env(cls) -> "ApiSettings":
        origins = [value.strip() for value in os.getenv("LATENT_GARDEN_CORS_ORIGINS", "*").split(",") if value.strip()]
        input_value = os.getenv("LATENT_GARDEN_INPUT")
        return cls(
            garden_path=_configured_path(os.getenv("LATENT_GARDEN_GARDEN"), PROJECT_ROOT / "frontend" / "garden.json"),
            input_path=str(_configured_path(input_value, PROJECT_ROOT)) if input_value else None,
            website=os.getenv("LATENT_GARDEN_WEBSITE") or None,
            provider=os.getenv("LATENT_GARDEN_PROVIDER", "hash"),
            openai_model=os.getenv("LATENT_GARDEN_OPENAI_MODEL", "text-embedding-3-small"),
            cache_path=_configured_path(os.getenv("LATENT_GARDEN_CACHE"), PROJECT_ROOT / ".latent-garden" / "api-embeddings.json"),
            max_pages=int(os.getenv("LATENT_GARDEN_MAX_PAGES", "6")),
            umap_neighbors=int(os.getenv("LATENT_GARDEN_UMAP_NEIGHBORS", "15")),
            umap_min_dist=float(os.getenv("LATENT_GARDEN_UMAP_MIN_DIST", "0.1")),
            clusters=int(os.getenv("LATENT_GARDEN_CLUSTERS")) if os.getenv("LATENT_GARDEN_CLUSTERS") else None,
            frontend_path=_configured_path(os.getenv("LATENT_GARDEN_FRONTEND"), PROJECT_ROOT / "frontend"),
            refresh_token=os.getenv("LATENT_GARDEN_REFRESH_TOKEN") or None,
            cors_origins=origins or ["*"],
        )


def _provider(settings: ApiSettings):
    if settings.provider == "hash":
        return HashEmbeddingProvider()
    if settings.provider == "openai":
        return OpenAIEmbeddingProvider(model=settings.openai_model)
    raise ValueError(f"Unsupported provider: {settings.provider}")


def _read_garden(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise HTTPException(status_code=503, detail=f"Garden file does not exist: {path}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=503, detail="Garden file is unavailable or invalid") from error
    if not isinstance(payload, dict) or not isinstance(payload.get("nodes"), list):
        raise HTTPException(status_code=503, detail="Garden file does not match the garden.json contract")
    return payload


def _write_garden(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def _refresh(settings: ApiSettings) -> dict[str, Any]:
    if not settings.input_path and not settings.website:
        raise HTTPException(status_code=400, detail="Configure LATENT_GARDEN_INPUT or LATENT_GARDEN_WEBSITE before refreshing")
    if settings.input_path and settings.website:
        raise HTTPException(status_code=400, detail="Configure only one of LATENT_GARDEN_INPUT or LATENT_GARDEN_WEBSITE")
    try:
        items = load_content(settings.input_path) if settings.input_path else load_website(settings.website or "", max_pages=settings.max_pages)
        garden = build_garden(
            items,
            provider=_provider(settings),
            cache=EmbeddingCache(settings.cache_path),
            reducer=UMAPReducer(n_neighbors=settings.umap_neighbors, min_dist=settings.umap_min_dist),
            clusterer=KMeansClusterer(clusters=settings.clusters),
        )
        payload = garden.to_dict()
        _write_garden(settings.garden_path, payload)
        return payload
    except HTTPException:
        raise
    except (OSError, ValueError, RuntimeError) as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


def create_app(settings: ApiSettings | None = None) -> FastAPI:
    settings = settings or ApiSettings.from_env()
    app = FastAPI(title="Latent Garden API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, Any]:
        payload = _read_garden(settings.garden_path)
        return {
            "ok": True,
            "nodes": len(payload["nodes"]),
            "clusters": len(payload.get("clusters", [])),
            "garden_path": str(settings.garden_path),
        }

    @app.get("/garden.json")
    @app.get("/api/garden")
    def garden() -> dict[str, Any]:
        return _read_garden(settings.garden_path)

    @app.post("/api/refresh")
    def refresh(x_latent_garden_key: str | None = Header(default=None, alias="X-Latent-Garden-Key")) -> dict[str, Any]:
        if not settings.refresh_token:
            raise HTTPException(status_code=403, detail="Refresh is disabled until LATENT_GARDEN_REFRESH_TOKEN is configured")
        if settings.refresh_token and not secrets.compare_digest(x_latent_garden_key or "", settings.refresh_token):
            raise HTTPException(status_code=401, detail="Invalid refresh key")
        with _refresh_lock:
            payload = _refresh(settings)
        return {"ok": True, "garden": payload}

    if settings.frontend_path and settings.frontend_path.exists():
        app.mount("/frontend", StaticFiles(directory=settings.frontend_path, html=True), name="frontend")
    return app


app = create_app()


def run() -> None:
    import uvicorn

    uvicorn.run("api.server:app", host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PORT", "8000")), reload=False)


if __name__ == "__main__":
    run()
