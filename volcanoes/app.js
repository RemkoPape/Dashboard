(function () {
  const state = { map: null, sources: [], features: [], lastUpdated: null, errors: [] };
  const els = {};

  function qs(id) { return document.getElementById(id); }

  function featureToMapFeature(event) {
    if (event.latitude === null || event.longitude === null) return null;
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [event.longitude, event.latitude] },
      properties: {
        event_id: event.event_id,
        title: event.title,
        source_name: event.source_name,
        source_url: event.source_url,
        source_record_url: event.source_record_url,
        summary: event.summary,
        severity: event.severity,
        status: event.status,
        data_mode: event.data_mode,
        updated: event.date_updated || event.date_start,
        colour: event.subtype === 'volcano' ? '#fb7185' : '#f59e0b'
      }
    };
  }

  function popupHtml(properties) {
    return `
      <div class="map-card">
        <div class="body">
          <strong>${DashboardHub.escapeHtml(properties.title || 'Hazard event')}</strong>
          <p>${DashboardHub.escapeHtml(properties.summary || '')}</p>
          <p><span class="status-pill ${DashboardHub.slugify(properties.data_mode || 'external')}">${DashboardHub.escapeHtml(properties.data_mode || 'external')}</span> ${DashboardHub.escapeHtml(properties.severity || 'unknown')} · ${DashboardHub.escapeHtml(properties.status || 'unknown')}</p>
          <div class="control-strip">
            <a class="button primary" href="${DashboardHub.escapeHtml(properties.source_record_url || properties.source_url)}" target="_blank" rel="noopener">Source</a>
            <a class="button" href="../events/?type=natural_hazard&subtype=volcano">Explorer</a>
          </div>
        </div>
      </div>
    `;
  }

  function updateStats() {
    els.sourceCount.textContent = String(state.sources.length);
    els.featureCount.textContent = String(state.features.length);
    els.updatedAt.textContent = state.lastUpdated ? DashboardHub.formatDateTime(state.lastUpdated) : 'no data';
    els.statusLabel.textContent = state.errors.length ? 'partial' : 'live';
    els.statusText.textContent = state.errors.length
      ? `Loaded ${state.features.length} events with ${state.errors.length} source error(s).`
      : `Loaded ${state.features.length} hazard events from ${state.sources.length} configured source(s).`;
  }

  function setLayerData() {
    if (!state.map.getSource('hazards')) return;
    state.map.getSource('hazards').setData({ type: 'FeatureCollection', features: state.features.filter(Boolean) });
  }

  function buildLegend() {
    els.legendList.innerHTML = `
      <div class="legend-item"><span class="swatch" style="background:#fb7185"></span>Volcano reports</div>
      <div class="legend-item"><span class="swatch" style="background:#f59e0b"></span>Landslide reports</div>
      <div class="legend-item"><span class="swatch" style="background:#f4b76b"></span>Selected or hovered event</div>
    `;
  }

  function initMap() {
    state.map = new maplibregl.Map({
      container: 'map',
      style: { version: 8, sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } }, layers: [{ id: 'osm', type: 'raster', source: 'osm' }] },
      center: [0, 20],
      zoom: 1.6
    });
    state.map.addControl(new maplibregl.NavigationControl(), 'top-right');
    state.map.on('load', () => {
      state.map.addSource('hazards', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      state.map.addLayer({
        id: 'hazard-points', type: 'circle', source: 'hazards', paint: {
          'circle-radius': 7,
          'circle-color': ['coalesce', ['get', 'colour'], '#fb7185'],
          'circle-opacity': 0.82,
          'circle-stroke-width': 1.4,
          'circle-stroke-color': '#ffffff'
        }
      });
      state.map.on('click', 'hazard-points', (event) => {
        const feature = event.features && event.features[0];
        if (!feature) return;
        new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '340px' })
          .setLngLat(feature.geometry.coordinates)
          .setHTML(popupHtml(feature.properties || {}))
          .addTo(state.map);
      });
      loadHazards();
    });
  }

  function bindElements() {
    els.sourceCount = qs('sourceCount');
    els.featureCount = qs('featureCount');
    els.updatedAt = qs('updatedAt');
    els.statusLabel = qs('statusLabel');
    els.statusText = qs('statusText');
    els.legendList = qs('legendList');
    els.refreshButton = qs('refreshButton');
  }

  async function loadHazards() {
    els.statusText.textContent = 'Loading live layers…';
    state.errors = [];
    try {
      const registry = await DashboardHub.loadRegistry('../config/data-sources.json');
      const selectedSources = registry.filter((source) => ['nasa-eonet-volcanoes', 'nasa-eonet-landslides'].includes(source.id));
      state.sources = selectedSources;
      const catalog = await DashboardHub.loadEventCatalog({ registry, sourceIds: selectedSources.map((source) => source.id), configUrl: '../config/data-sources.json' });
      state.features = (catalog.events || [])
        .filter((event) => ['volcano', 'landslide'].includes(String(event.subtype || '').toLowerCase()))
        .map(featureToMapFeature)
        .filter(Boolean);
      state.lastUpdated = catalog.generated_at;
      setLayerData();
      updateStats();
      buildLegend();
    } catch (error) {
      console.error(error);
      state.errors.push(error);
      state.features = [];
      setLayerData();
      updateStats();
      els.statusText.textContent = 'Could not load live volcano/landslide sources right now.';
    }
  }

  function bindActions() {
    els.refreshButton.addEventListener('click', loadHazards);
  }

  function init() {
    bindElements();
    bindActions();
    initMap();
  }

  document.addEventListener('DOMContentLoaded', init);
})();