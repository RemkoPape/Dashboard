(function () {
  const STORAGE_KEY = "dashboard-hub-osm-search-cache-v1";
  const CACHE_TTL_MS = 15 * 60 * 1000;
  const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=10&q=";
  const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
  const OVERPASS_CATEGORY_FILTERS = {
    hospitals: 'node[amenity=hospital](around:{radius},{lat},{lon});way[amenity=hospital](around:{radius},{lat},{lon});relation[amenity=hospital](around:{radius},{lat},{lon});',
    airports: 'node[aeroway=aerodrome](around:{radius},{lat},{lon});way[aeroway=aerodrome](around:{radius},{lat},{lon});relation[aeroway=aerodrome](around:{radius},{lat},{lon});',
    train_stations: 'node[railway=station](around:{radius},{lat},{lon});node[public_transport=station](around:{radius},{lat},{lon});way[railway=station](around:{radius},{lat},{lon});',
    supermarkets: 'node[shop=supermarket](around:{radius},{lat},{lon});way[shop=supermarket](around:{radius},{lat},{lon});',
    campsites: 'node[tourism=camp_site](around:{radius},{lat},{lon});way[tourism=camp_site](around:{radius},{lat},{lon});',
    mountain_huts: 'node[tourism=alpine_hut](around:{radius},{lat},{lon});node[building=hut](around:{radius},{lat},{lon});',
    rivers: 'way[waterway=river](around:{radius},{lat},{lon});relation[waterway=river](around:{radius},{lat},{lon});',
    lakes: 'way[natural=water](around:{radius},{lat},{lon});relation[natural=water](around:{radius},{lat},{lon});',
    research_stations: 'node[man_made=research_institute](around:{radius},{lat},{lon});node[amenity=university](around:{radius},{lat},{lon});',
    emergency_services: 'node[amenity=police](around:{radius},{lat},{lon});node[amenity=fire_station](around:{radius},{lat},{lon});node[amenity=ambulance_station](around:{radius},{lat},{lon});',
    fuel_stations: 'node[amenity=fuel](around:{radius},{lat},{lon});way[amenity=fuel](around:{radius},{lat},{lon});',
    public_toilets: 'node[amenity=toilets](around:{radius},{lat},{lon});way[amenity=toilets](around:{radius},{lat},{lon});',
    hiking_trails: 'way[highway=path](around:{radius},{lat},{lon});way[highway=footway](around:{radius},{lat},{lon});way[highway=track](around:{radius},{lat},{lon});',
    protected_areas: 'relation[boundary=protected_area](around:{radius},{lat},{lon});relation[natural=wood](around:{radius},{lat},{lon});',
    weather_stations: 'node[man_made=weather_station](around:{radius},{lat},{lon});node[weather=station](around:{radius},{lat},{lon});',
    universities: 'node[amenity=university](around:{radius},{lat},{lon});way[amenity=university](around:{radius},{lat},{lon});relation[amenity=university](around:{radius},{lat},{lon});'
  };

  const state = {
    map: null,
    markers: [],
    results: [],
    selected: null,
    selectedPlace: null,
    queryTimer: null
  };

  const els = {};

  function qs(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return DashboardHub.escapeHtml(value);
  }

  function loadCache() {
    try {
      const payload = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (!payload || !payload.savedAt || Date.now() - payload.savedAt > CACHE_TTL_MS) return {};
      return payload.entries || {};
    } catch (error) {
      return {};
    }
  }

  function saveCache(entries) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), entries }));
    } catch (error) {
      return;
    }
  }

  function cacheKey(kind, value) {
    return `${kind}:${value}`.toLowerCase();
  }

  function readCached(kind, value) {
    const entries = loadCache();
    return entries[cacheKey(kind, value)] || null;
  }

  function writeCached(kind, value, data) {
    const entries = loadCache();
    entries[cacheKey(kind, value)] = { savedAt: Date.now(), data };
    saveCache(entries);
  }

  function getRadius() {
    return Number(els.radiusSelect.value || 1000);
  }

  function getLimit() {
    return Number(els.limitSelect.value || 10);
  }

  function getSearchMode() {
    return els.searchModeSelect.value || "place";
  }

  function getSelectedCategories() {
    return Array.from(document.querySelectorAll('[data-category-checkbox]'))
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => checkbox.value);
  }

  function parseCoordinates() {
    const latitude = Number(els.latInput.value);
    const longitude = Number(els.lonInput.value);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  }

  function setStatus(message) {
    els.searchStatus.textContent = message;
  }

  function clearMarkers() {
    state.markers.forEach((marker) => marker.remove());
    state.markers = [];
  }

  function addCircleMarker(lat, lon, options) {
    const marker = L.circleMarker([lat, lon], {
      radius: options.radius || 8,
      color: options.color || "#79d3ff",
      weight: 2,
      fillColor: options.fillColor || "#79d3ff",
      fillOpacity: options.fillOpacity || 0.32
    }).addTo(state.map);

    if (options.popup) {
      marker.bindPopup(options.popup, { maxWidth: 320 });
    }

    state.markers.push(marker);
    return marker;
  }

  function clearResults() {
    state.results = [];
    state.selected = null;
    els.resultList.innerHTML = '<div class="empty">Results will appear here after a lookup.</div>';
    els.resultsMeta.textContent = 'No results loaded yet.';
    els.searchCount.textContent = '0';
    els.activeResultLabel.textContent = 'None';
    clearMarkers();
  }

  function renderResults() {
    els.searchCount.textContent = String(state.results.length);
    els.resultsMeta.textContent = state.selectedPlace
      ? `Showing ${state.results.length} result(s) for ${state.selectedPlace.label}`
      : `${state.results.length} result(s) returned`;

    if (!state.results.length) {
      els.resultList.innerHTML = '<div class="empty">No results matched the current search.</div>';
      return;
    }

    els.resultList.innerHTML = state.results.map((result, index) => {
      const selected = state.selected && state.selected.id === result.id ? ' selected' : '';
      return `
        <article class="result-card${selected}" data-result-id="${escapeHtml(result.id)}">
          <div class="status-row">
            <span class="pill live">${escapeHtml(result.kind)}</span>
            <span class="badge">${escapeHtml(result.source)}</span>
          </div>
          <h3>${escapeHtml(result.name)}</h3>
          <p>${escapeHtml(result.details || result.display || '')}</p>
          <div class="muted">${escapeHtml(result.extra || '')}</div>
          <div class="page-actions">
            <button class="chip-link" type="button" data-select-result="${escapeHtml(result.id)}">Focus</button>
            <a class="chip-link" href="${escapeHtml(result.osmUrl)}" target="_blank" rel="noopener">Open in OSM</a>
            <button class="chip-link" type="button" data-copy-coords="${escapeHtml(result.id)}">Copy coords</button>
          </div>
        </article>
      `;
    }).join('');
  }

  function selectResult(resultId) {
    const result = state.results.find((item) => item.id === resultId);
    if (!result) return;
    state.selected = result;
    els.activeResultLabel.textContent = result.name;

    state.map.setView([result.latitude, result.longitude], Math.max(state.map.getZoom(), result.zoom || 12), { animate: true });
    clearMarkers();

    state.results.forEach((item) => {
      addCircleMarker(item.latitude, item.longitude, {
        color: item.id === result.id ? '#f4b76b' : '#79d3ff',
        fillColor: item.id === result.id ? '#f4b76b' : '#79d3ff',
        fillOpacity: item.id === result.id ? 0.48 : 0.3,
        radius: item.id === result.id ? 10 : 7,
        popup: `<strong>${escapeHtml(item.name)}</strong><br>${escapeHtml(item.display || '')}<br><a href="${escapeHtml(item.osmUrl)}" target="_blank" rel="noopener">OpenStreetMap</a>`
      });
    });

    renderResults();
    if (state.selected) {
      const selectedCard = document.querySelector(`[data-result-id="${CSS.escape(result.id)}"]`);
      if (selectedCard) selectedCard.scrollIntoView({ block: 'nearest' });
    }
  }

  function copySelectedCoordinates() {
    if (!state.selected) return;
    const text = `${state.selected.latitude.toFixed(6)}, ${state.selected.longitude.toFixed(6)}`;
    DashboardHub.copyText(text).then((copied) => {
      setStatus(copied ? `Copied ${text}` : 'Could not copy coordinates automatically.');
    });
  }

  async function lookupPlace(query) {
    const cached = readCached('place', query);
    if (cached) return cached.data;

    const response = await fetch(`${NOMINATIM_URL}${encodeURIComponent(query)}`, {
      headers: {
        'Accept-Language': 'en'
      }
    });

    if (!response.ok) {
      throw new Error(`Nominatim returned ${response.status}`);
    }

    const data = await response.json();
    writeCached('place', query, data);
    return data;
  }

  function buildOverpassQuery(latitude, longitude, radius, categories) {
    const filters = categories.length ? categories : Object.keys(OVERPASS_CATEGORY_FILTERS);
    const fragments = filters
      .map((category) => OVERPASS_CATEGORY_FILTERS[category])
      .filter(Boolean)
      .map((fragment) => fragment.replaceAll('{radius}', String(radius)).replaceAll('{lat}', String(latitude)).replaceAll('{lon}', String(longitude)))
      .join('\n');

    return `
      [out:json][timeout:30];
      (
        ${fragments}
      );
      out center tags;
    `;
  }

  function centroidFromElement(element) {
    if (typeof element.lat === 'number' && typeof element.lon === 'number') {
      return { latitude: element.lat, longitude: element.lon };
    }

    if (element.center && typeof element.center.lat === 'number' && typeof element.center.lon === 'number') {
      return { latitude: element.center.lat, longitude: element.center.lon };
    }

    return null;
  }

  async function lookupNearby(latitude, longitude, radius, categories) {
    const cacheId = `${latitude},${longitude}:${radius}:${categories.sort().join('|')}`;
    const cached = readCached('nearby', cacheId);
    if (cached) return cached.data;

    const body = buildOverpassQuery(latitude, longitude, radius, categories);
    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Accept': 'application/json'
      },
      body
    });

    if (!response.ok) {
      throw new Error(`Overpass returned ${response.status}`);
    }

    const data = await response.json();
    writeCached('nearby', cacheId, data);
    return data;
  }

  function osmLink(latitude, longitude, label) {
    return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(latitude)}&mlon=${encodeURIComponent(longitude)}#map=14/${encodeURIComponent(latitude)}/${encodeURIComponent(longitude)}`;
  }

  function placeResultToItem(place) {
    const latitude = Number(place.lat);
    const longitude = Number(place.lon);
    return {
      id: `place:${place.place_id}`,
      kind: 'Place',
      source: 'Nominatim',
      name: place.display_name || place.name || 'Place result',
      display: place.type || place.class || '',
      details: place.address ? Object.entries(place.address).map(([key, value]) => `${key}: ${value}`).join(' · ') : '',
      extra: `Lat/Lon: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
      latitude,
      longitude,
      osmUrl: place.osm_type && place.osm_id ? `https://www.openstreetmap.org/${place.osm_type.charAt(0)}/${place.osm_id}` : osmLink(latitude, longitude),
      zoom: Number(place.boundingbox && place.boundingbox.length ? 12 : 14)
    };
  }

  function nearbyResultToItem(element) {
    const centroid = centroidFromElement(element);
    if (!centroid) return null;

    const tags = element.tags || {};
    const label = tags.name || tags.ref || tags.official_name || tags.operator || tags.amenity || tags.tourism || tags.natural || 'POI';
    const category = tags.amenity || tags.tourism || tags.natural || tags.highway || tags.man_made || 'poi';
    const type = element.type || 'element';

    return {
      id: `overpass:${type}:${element.id}`,
      kind: 'POI',
      source: 'OpenStreetMap / Overpass',
      name: label,
      display: category,
      details: Object.entries(tags).slice(0, 6).map(([key, value]) => `${key}: ${value}`).join(' · '),
      extra: `OSM ${type} ${element.id}`,
      latitude: centroid.latitude,
      longitude: centroid.longitude,
      osmUrl: `https://www.openstreetmap.org/${type}/${element.id}`,
      zoom: 15
    };
  }

  function updateMapCenterFromSelection() {
    if (!state.selected) return;
    state.map.setView([state.selected.latitude, state.selected.longitude], Math.max(13, state.map.getZoom()), { animate: true });
  }

  async function runSearch() {
    const placeQuery = els.placeInput.value.trim();
    const coordinates = parseCoordinates();
    const categories = getSelectedCategories();
    const mode = getSearchMode();

    if (mode === 'place' || mode === 'both') {
      if (placeQuery.length < 3) {
        setStatus('Enter at least 3 characters for a place search.');
        return;
      }

      setStatus('Searching Nominatim…');
      try {
        const places = await lookupPlace(placeQuery);
        const placeItems = (Array.isArray(places) ? places : []).slice(0, getLimit()).map(placeResultToItem);

        state.results = placeItems;
        state.selectedPlace = { label: placeQuery };

        if (coordinates && mode === 'both') {
          await runNearbySearch(coordinates, categories);
          return;
        }

        clearMarkers();
        state.results.forEach((result) => {
          addCircleMarker(result.latitude, result.longitude, {
            color: '#79d3ff',
            fillColor: '#79d3ff',
            popup: `<strong>${escapeHtml(result.name)}</strong><br>${escapeHtml(result.details || result.display || '')}<br><a href="${escapeHtml(result.osmUrl)}" target="_blank" rel="noopener">OpenStreetMap</a>`
          });
        });

        renderResults();
        if (state.selected) {
          selectResult(state.selected.id);
        }
        setStatus(`Loaded ${state.results.length} place result(s).`);
      } catch (error) {
        console.error(error);
        setStatus(error.message || 'Could not load place results.');
      }
    }

    if ((mode === 'nearby' || mode === 'both') && coordinates) {
      await runNearbySearch(coordinates, categories);
    }
  }

  async function runNearbySearch(coordinates, categories) {
    const radius = getRadius();
    setStatus('Searching nearby POIs via Overpass…');

    try {
      const data = await lookupNearby(coordinates.latitude, coordinates.longitude, radius, categories);
      const elements = Array.isArray(data.elements) ? data.elements : [];
      const nearbyItems = elements.map(nearbyResultToItem).filter(Boolean).slice(0, getLimit());

      if (!nearbyItems.length) {
        setStatus('No nearby POIs were found for the current filters.');
        state.results = [];
        renderResults();
        clearMarkers();
        return;
      }

      state.selectedPlace = { label: `near ${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)}` };
      state.results = nearbyItems;
      state.selected = state.results[0] || null;
      clearMarkers();

      addCircleMarker(coordinates.latitude, coordinates.longitude, {
        color: '#f4b76b',
        fillColor: '#f4b76b',
        radius: 10,
        popup: `<strong>Selected coordinates</strong><br>${coordinates.latitude.toFixed(6)}, ${coordinates.longitude.toFixed(6)}`
      });

      state.results.forEach((result) => {
        addCircleMarker(result.latitude, result.longitude, {
          color: '#79d3ff',
          fillColor: '#79d3ff',
          popup: `<strong>${escapeHtml(result.name)}</strong><br>${escapeHtml(result.details || result.display || '')}<br><a href="${escapeHtml(result.osmUrl)}" target="_blank" rel="noopener">OpenStreetMap</a>`
        });
      });

      state.map.setView([coordinates.latitude, coordinates.longitude], 14, { animate: true });
      renderResults();
      if (state.selected) {
        selectResult(state.selected.id);
      }
      setStatus(`Loaded ${state.results.length} nearby result(s).`);
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'Could not load nearby results.');
    }
  }

  function scheduleSearch() {
    window.clearTimeout(state.queryTimer);
    state.queryTimer = window.setTimeout(() => {
      const mode = getSearchMode();
      if (mode === 'place' && els.placeInput.value.trim().length < 3) return;
      if ((mode === 'nearby' || mode === 'both') && !parseCoordinates()) return;
      runSearch();
    }, 500);
  }

  function populateCategoryGrid() {
    const categories = [
      ['hospitals', 'Hospitals'],
      ['airports', 'Airports'],
      ['train_stations', 'Train stations'],
      ['supermarkets', 'Supermarkets'],
      ['campsites', 'Campsites'],
      ['mountain_huts', 'Mountain huts'],
      ['rivers', 'Rivers'],
      ['lakes', 'Lakes'],
      ['research_stations', 'Research stations'],
      ['emergency_services', 'Emergency services'],
      ['fuel_stations', 'Fuel stations'],
      ['public_toilets', 'Public toilets'],
      ['hiking_trails', 'Hiking trails'],
      ['protected_areas', 'Protected areas'],
      ['weather_stations', 'Weather stations'],
      ['universities', 'Universities']
    ];

    els.categoryGrid.innerHTML = categories.map(([value, label]) => `
      <label><input data-category-checkbox type="checkbox" value="${escapeHtml(value)}" ${['hospitals', 'emergency_services'].includes(value) ? 'checked' : ''} />${escapeHtml(label)}</label>
    `).join('');
  }

  function bindListeners() {
    els.placeInput.addEventListener('input', () => {
      if (getSearchMode() === 'place') scheduleSearch();
    });

    [els.latInput, els.lonInput, els.radiusSelect, els.limitSelect, els.searchModeSelect].forEach((element) => {
      element.addEventListener('change', () => {
        if (getSearchMode() !== 'place' || parseCoordinates()) {
          scheduleSearch();
        }
      });
    });

    document.addEventListener('change', (event) => {
      if (event.target && event.target.matches('[data-category-checkbox]') && getSearchMode() !== 'place' && parseCoordinates()) {
        scheduleSearch();
      }
    });

    els.searchButton.addEventListener('click', runSearch);
    els.copyCoordsButton.addEventListener('click', copySelectedCoordinates);
    els.clearButton.addEventListener('click', () => {
      els.placeInput.value = '';
      els.latInput.value = '';
      els.lonInput.value = '';
      state.selectedPlace = null;
      clearResults();
      state.map.setView([20, 0], 2, { animate: true });
      setStatus('Cleared search state.');
    });

    els.resultList.addEventListener('click', (event) => {
      const selectButton = event.target.closest('[data-select-result]');
      const copyButton = event.target.closest('[data-copy-coords]');
      if (selectButton) {
        selectResult(selectButton.getAttribute('data-select-result'));
      }
      if (copyButton) {
        const result = state.results.find((item) => item.id === copyButton.getAttribute('data-copy-coords'));
        if (result) {
          DashboardHub.copyText(`${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)}`).then((copied) => {
            setStatus(copied ? `Copied ${result.name} coordinates.` : 'Could not copy coordinates automatically.');
          });
        }
      }
    });
  }

  function initMap() {
    state.map = L.map('osmMap', { zoomControl: true }).setView([20, 0], 2);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(state.map);
  }

  function bindElements() {
    els.placeInput = qs('placeInput');
    els.latInput = qs('latInput');
    els.lonInput = qs('lonInput');
    els.radiusSelect = qs('radiusSelect');
    els.limitSelect = qs('limitSelect');
    els.searchModeSelect = qs('searchModeSelect');
    els.categoryGrid = qs('categoryGrid');
    els.searchButton = qs('searchButton');
    els.copyCoordsButton = qs('copyCoordsButton');
    els.clearButton = qs('clearButton');
    els.searchCount = qs('searchCount');
    els.activeResultLabel = qs('activeResultLabel');
    els.searchStatus = qs('searchStatus');
    els.resultsMeta = qs('resultsMeta');
    els.resultList = qs('resultList');
  }

  function init() {
    bindElements();
    populateCategoryGrid();
    initMap();
    clearResults();
    bindListeners();
  }

  document.addEventListener('DOMContentLoaded', init);
})();