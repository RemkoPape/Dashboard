# Dashboard Hub

Dashboard Hub is a GitHub Pages-friendly personal monitoring site built around live public data, compact browser-side normalisation, and a shared Event Explorer.

## Current structure

- [index.html](index.html) - homepage command centre
- [events/](events/) - central Event Explorer with filtering, pagination, and Obsidian export
- [earthquakes/](earthquakes/) - live USGS earthquake map
- [wildfires/](wildfires/) - live NASA EONET wildfire map
- [floods/](floods/) - flood and storm monitor shell
- [volcanoes/](volcanoes/) - volcano and landslide monitor shell
- [conflict/](conflict/) - conflict and war monitor shell
- [satellite/](satellite/) - satellite and environmental monitor shell
- [osm-search/](osm-search/) - OpenStreetMap location search and nearby POIs
- [news/](news/) - shared RSS reader and feed previews
- [documents/](documents/) - PDF and portfolio sharing page
- [assets/](assets/) - shared CSS and JavaScript for the new dashboard architecture
- [config/data-sources.json](config/data-sources.json) - source registry and adapter metadata
- [data/compact-events.json](data/compact-events.json) - compact rolling fallback cache
- [data/source-status.json](data/source-status.json) - compact source status snapshot

## Architecture

The site now uses a layered data strategy.

1. The browser fetches live sources directly when CORS and terms allow it.
2. The source registry in `config/data-sources.json` describes the endpoint, category, adapter, attribution, refresh rate, and access mode.
3. Shared client-side code in `assets/dashboard-core.js` normalises different payload shapes into one event schema.
4. If a live request fails and the source provides a compact cache file, the loader falls back to that small snapshot.
5. GitHub Actions only updates compact cache files and source status snapshots; it does not store bulk archives.

The dashboard avoids local bulk event archives, large raster downloads, and permanent storage of long historical data.

## Live sources

The current registry includes direct browser sources for:

- USGS earthquake GeoJSON feeds
- NASA EONET wildfire, flood, storm, volcano, and landslide feeds
- NOAA / National Weather Service active alerts
- NASA EPIC Earth imagery
- GDELT conflict reporting signals

Sources that are only external or not yet fully automated remain visible in the registry so their limits are explicit.

See [DATA_SOURCES.md](DATA_SOURCES.md) for the compact source matrix.

## Event Explorer

The Event Explorer normalises source records into a shared event object with:

- event type and subtype
- timestamps
- source attribution and licence
- severity, confidence, and data mode
- coordinates when available
- grouped source references for likely duplicates

It supports text search, date filtering, type and subtype filtering, source filters, severity and status filters, live/cached/manual/external filtering, and Obsidian note export.

## Obsidian export

Each event detail panel includes a `Copy Obsidian Event Note` button. The copied note contains YAML front matter, the event summary, coordinates, source links, attribution, and related source references.

## GitHub Actions cache

The workflow in [`.github/workflows/update-compact-cache.yml`](.github/workflows/update-compact-cache.yml) runs on a schedule and via `workflow_dispatch`.

It updates compact files only:

- `data/compact-events.json`
- `data/source-status.json`

The workflow is intentionally small so it can fail per-source without forcing the whole site to depend on a backend.

## Running locally

Open the repo with a static server. Any local server is fine, for example:

```bash
python -m http.server 8000
```

Then open the site root in a browser.

## Testing

Check the following pages after changes:

- homepage cards and live previews
- [events/](events/) table filtering and Obsidian copy action
- [earthquakes/](earthquakes/) and [wildfires/](wildfires/) map loads
- [osm-search/](osm-search/) place and POI lookup

## Attribution and licensing

Each source entry carries visible attribution and licence notes where available. The UI labels live, cached, external, and manual data differently so users can distinguish the data mode at a glance.

## Obsidian and the main entry point

The repository is designed to embed cleanly in an Obsidian dashboard. The public entry point is the homepage at [index.html](index.html).
