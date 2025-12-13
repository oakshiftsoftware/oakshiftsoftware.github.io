import json
import os
from pathlib import Path
from typing import Optional

import requests
from kivy.utils import platform


class DataService:
    """Fetches JSON data from CDN with simple local caching.

    Cache location uses `app.user_data_dir` when available (Android/iOS),
    otherwise a `cache` folder under the package directory.
    """

    def __init__(self, app):
        self.app = app
        self.config = getattr(app, "app_config", None) or getattr(app, "config", None)
        cdn_host = None
        if self.config is not None:
            cdn_host = getattr(self.config, "cdn_host", None)
        if not cdn_host:
            cdn_host = "https://oakshiftsoftware.github.io/cdn/young-suns-companion"
        resources_path = (
            getattr(self.config, "resources_path", None)
            or "/".join([cdn_host, "resources.json"])
        )
        blueprints_path = (
            getattr(self.config, "blueprints_path", None)
            or "/".join([cdn_host, "blueprints.json"])
        )
        
        try:
            base_dir = Path(app.user_data_dir)
        except Exception:
            base_dir = Path(__file__).resolve().parent / "cache"
        self.cache_dir = base_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        self.sources = {
            "blueprints": {
                "url": blueprints_path,
                "file": self.cache_dir / "blueprints.json",
            },
            "resources": {
                "url": resources_path,
                "file": self.cache_dir / "resources.json",
            },
            "queue": {
                "url": None,  # Local only
                "file": self.cache_dir / "queue.json",
            },
            "tracker": {
                "url": None,  # Local only
                "file": self.cache_dir / "tracker.json",
            },
        }

    def _read_cache(self, key: str) -> Optional[dict]:
        f = self.sources[key]["file"]
        if f.exists():
            try:
                with f.open("r", encoding="utf-8") as fp:
                    return json.load(fp)
            except Exception:
                return None
        return None

    def _write_cache(self, key: str, data: dict) -> None:
        f = self.sources[key]["file"]
        try:
            with f.open("w", encoding="utf-8") as fp:
                json.dump(data, fp, ensure_ascii=False, indent=2)
        except Exception:
            pass

    def get_cached(self, key: str) -> Optional[dict]:
        """Return cached JSON if available (no network)."""
        if key not in self.sources:
            return None
        return self._read_cache(key)

    def fetch_and_cache(self, key: str) -> Optional[dict]:
        """Force network fetch (if URL) and update cache; fall back to cache on failure."""
        if key not in self.sources:
            return None
        url = self.sources[key]["url"]
        if url:
            try:
                resp = requests.get(url, timeout=10)
                if resp.ok:
                    data = resp.json()
                    if isinstance(data, dict):
                        self._write_cache(key, data)
                        return data
            except Exception:
                pass
        return self._read_cache(key)

    def get_json(self, key: str) -> Optional[dict]:
        """Fast path: return cache immediately if present, else fetch and cache."""
        cached = self.get_cached(key)
        if cached is not None:
            return cached
        return self.fetch_and_cache(key)
    
    def save_json(self, key: str, data: dict) -> None:
        """Save JSON data to cache (for queue, tracker, etc.)"""
        if key in self.sources:
            self._write_cache(key, data)
