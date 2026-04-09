"""HTTP helpers for fetching JSON from remote APIs."""

import json
import time
import urllib.error
import urllib.request


_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; WarframeDB-DataPipeline/1.0; +https://github.com/KnittelK/Warframe_DB)",
    "Accept": "application/json",
}


def _fetch_with_retry(url: str, label: str, retries: int = 3, backoff: float = 1.0) -> bytes:
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=_HEADERS)
            with urllib.request.urlopen(req) as response:
                return response.read()
        except urllib.error.HTTPError:
            raise  # Don't retry HTTP errors (4xx/5xx)
        except Exception as e:
            if attempt == retries:
                raise
            wait = backoff * (2 ** attempt)
            print(f"{label}: retrying in {wait:.0f}s ({e})")
            time.sleep(wait)


def fetch_json(url: str, label: str) -> dict | list:
    """Fetch JSON from url. Strips UTF-8 BOM if present. Raises on HTTP error."""
    print(f"Fetching {label}...")
    raw = _fetch_with_retry(url, label)
    text = raw.decode("utf-8-sig")  # utf-8-sig strips BOM if present
    return json.loads(text)


def fetch_json_optional(url: str, label: str) -> dict | list | None:
    """Same as fetch_json but returns None on failure instead of raising."""
    try:
        return fetch_json(url, label)
    except Exception as e:
        print(f"{label} unavailable, continuing without it: {e}")
        return None
