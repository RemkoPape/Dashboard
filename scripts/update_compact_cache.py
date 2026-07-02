#!/usr/bin/env python3
"""Build a compact event cache for the GitHub Pages fallback path.

This script keeps only current source metadata and a small rolling event list.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import URLError, HTTPError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "config" / "data-sources.json"
OUTPUT_PATH = ROOT / "data" / "compact-events.json"
STATUS_PATH = ROOT / "data" / "source-status.json"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def load_registry() -> list[dict]:
    with REGISTRY_PATH.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return payload.get("sources", [])


def fetch_json(url: str) -> object:
    request = Request(url, headers={"User-Agent": "dashboard-hub-cache/1.0"})
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def normalize_geojson(source: dict, payload: dict) -> list[dict]:
    events = []
    for feature in payload.get("features", [])[:20]:
        properties = feature.get("properties", {})
        geometry = feature.get("geometry", {})
        coordinates = geometry.get("coordinates", []) if isinstance(geometry, dict) else []
        lon = coordinates[0] if len(coordinates) >= 2 else None
        lat = coordinates[1] if len(coordinates) >= 2 else None
        event_id = properties.get("id") or feature.get("id") or f"{source['id']}:{properties.get('title', 'event')}"
        events.append(
            {
                "event_id": event_id,
                "title": properties.get("title") or source.get("name"),
                "event_type": source.get("event_type", "natural_hazard"),
                "subtype": source.get("subtype", "event"),
                "date_start": properties.get("date") or properties.get("time") or properties.get("updated"),
                "date_updated": properties.get("updated") or properties.get("date") or properties.get("time"),
                "country": properties.get("country", ""),
                "region": properties.get("place") or properties.get("areaDesc") or "",
                "latitude": lat,
                "longitude": lon,
                "severity": properties.get("severity") or properties.get("alert") or "unknown",
                "status": properties.get("status") or "active",
                "source_name": source.get("name"),
                "source_url": source.get("url"),
                "source_record_url": properties.get("url") or properties.get("link") or source.get("url"),
                "summary": properties.get("description") or properties.get("headline") or source.get("name"),
                "confidence": source.get("confidence", "medium"),
                "tags": [source.get("category"), source.get("subtype")],
                "map_page": "../events/",
                "data_mode": "cached",
                "license": source.get("license", "Source-specific"),
                "attribution": source.get("attribution", source.get("name")),
                "source_id": source.get("id"),
                "source_category": source.get("category"),
                "source_adapter": source.get("adapter"),
                "source_refresh_minutes": source.get("refresh_interval_minutes"),
                "grouped_source_count": 1,
                "grouped_sources": [
                    {
                        "source_id": source.get("id"),
                        "source_name": source.get("name"),
                        "source_url": source.get("url"),
                        "source_record_url": properties.get("url") or properties.get("link") or source.get("url"),
                        "data_mode": "cached"
                    }
                ],
            }
        )
    return events


def normalize_epic(source: dict, payload: list[dict]) -> list[dict]:
    events = []
    for record in payload[:10]:
        date = record.get("date")
        events.append(
            {
                "event_id": f"{source['id']}:{record.get('image', date)}",
                "title": record.get("caption") or source.get("name"),
                "event_type": "satellite",
                "subtype": "earth-observation",
                "date_start": f"{date}T00:00:00Z" if date else None,
                "date_updated": f"{date}T00:00:00Z" if date else None,
                "country": "",
                "region": "",
                "latitude": None,
                "longitude": None,
                "severity": "informational",
                "status": "active",
                "source_name": source.get("name"),
                "source_url": source.get("url"),
                "source_record_url": f"{source.get('url')}/{record.get('image', '')}",
                "summary": record.get("caption") or source.get("name"),
                "confidence": source.get("confidence", "high"),
                "tags": ["satellite", "earth-observation"],
                "map_page": "../satellite/",
                "data_mode": "cached",
                "license": source.get("license", "Source-specific"),
                "attribution": source.get("attribution", source.get("name")),
                "source_id": source.get("id"),
                "source_category": source.get("category"),
                "source_adapter": source.get("adapter"),
                "source_refresh_minutes": source.get("refresh_interval_minutes"),
                "grouped_source_count": 1,
                "grouped_sources": [
                    {
                        "source_id": source.get("id"),
                        "source_name": source.get("name"),
                        "source_url": source.get("url"),
                        "source_record_url": f"{source.get('url')}/{record.get('image', '')}",
                        "data_mode": "cached"
                    }
                ],
            }
        )
    return events


def fetch_source(source: dict) -> tuple[list[dict], str]:
    adapter = str(source.get("adapter", "")).lower()
    try:
      payload = fetch_json(source["url"])
      if adapter in {"geojson", "nws-alerts"}:
        return normalize_geojson(source, payload if isinstance(payload, dict) else {}), "live"
      if adapter == "epic":
        return normalize_epic(source, payload if isinstance(payload, list) else []), "live"
      return [], "external"
    except (HTTPError, URLError, TimeoutError, ValueError) as error:
      return [], f"error: {error}"


def main() -> int:
    sources = load_registry()
    compact_events: list[dict] = []
    statuses: list[dict] = []

    for source in sources:
        if source.get("access_mode") != "live":
            statuses.append({"id": source.get("id"), "status": source.get("access_mode", "external")})
            continue

        events, status = fetch_source(source)
        statuses.append({"id": source.get("id"), "status": status, "event_count": len(events)})
        compact_events.extend(events)

    payload = {
        "generated_at": utc_now(),
        "event_count": len(compact_events),
        "events": compact_events[:500],
        "sources": statuses,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    with STATUS_PATH.open("w", encoding="utf-8") as handle:
        json.dump({"generated_at": utc_now(), "sources": statuses}, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())