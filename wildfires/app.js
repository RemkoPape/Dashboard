const DATASETS = {
  "7d": {
    label: "Past 7 days",
    days: 7
  },
  "30d": {
    label: "Past 30 days",
    days: 30
  },
  "90d": {
    label: "Past 90 days",
    days: 90
  }
};

const INTENSITY_COLOURS = {
  low: "#f7d154",
  moderate: "#ff9a3d",
  high: "#ff5c39",
  extreme: "#d7263d"
};

const INTENSITY_LABELS = {
  low: "Smaller event",
  moderate: "Moderate event",
  high: "Large event",
  extreme: "Major event"
};

const QUICK_ADD_IMPORT_URI =
  "obsidian://adv-uri?vault=Life&commandid=quickadd%3Achoice%3A395808e2-6330-4744-af7e-6daf734002c3";

const EONET_EVENTS_URL = "https://eonet.gsfc.nasa.gov/api/v3/events/geojson";
const EONET_DOCS_URL = "https://eonet.gsfc.nasa.gov/docs/v3";

const state = {
  period: "30d",
  intensity: "all",
  cache: new Map(),
  currentCollection: null,
  activeRequestId: 0
};

const elements = {
  periodSelect: document.getElementById("periodSelect"),
  intensitySelect: document.getElementById("intensitySelect"),
  visibleCount: document.getElementById("visibleCount"),
  highestFrp: document.getElementById("highestFrp"),
  extremeCount: document.getElementById("extremeCount"),
  lastUpdate: document.getElementById("lastUpdate"),
  statusPanel: document.getElementById("statusPanel")
};

const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors"
      }
    },
    layers: [
      {
        id: "osm",
        type: "raster",
        source: "osm",
        paint: {
          "raster-saturation": -0.45,
          "raster-brightness-min": 0.05,
          "raster-brightness-max": 0.92
        }
      }
    ]
  },
  center: [15, 20],
  zoom: 1.35
});

map.addControl(new maplibregl.NavigationControl(), "top-right");

function formatValue(value, fallback = "not available") {
  if (value === null || value === undefined || value === "") return fallback;
  return value;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatUtcDateTime(value) {
  if (!value) return "not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "not available";
  return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function formatLastUpdate(value) {
  if (!value) return "no data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "no data";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toLocaleString();
}

function formatCoordinate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "not available";
  return number.toFixed(4);
}

function formatAcres(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "not available";
  return `${number.toLocaleString(undefined, { maximumFractionDigits: 0 })} acres`;
}

function formatAgeHours(value) {
  const hours = Number(value);
  if (!Number.isFinite(hours)) return "not available";
  if (hours < 24) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

function frontMatterScalar(value) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function setStatusMessage(message = "") {
  if (!elements.statusPanel) return;
  elements.statusPanel.hidden = !message;
  elements.statusPanel.textContent = message;
}

function intensityClassForAcres(acres) {
  const value = Number(acres);
  if (!Number.isFinite(value)) return "low";
  if (value < 100) return "low";
  if (value < 1000) return "moderate";
  if (value < 10000) return "high";
  return "extreme";
}

function colourForIntensity(intensityClass) {
  return INTENSITY_COLOURS[intensityClass] || "#f7d154";
}

function radiusForIntensity(intensityClass, acres) {
  const base = {
    low: 7,
    moderate: 9,
    high: 12,
    extreme: 16
  }[intensityClass] || 7;
  const acresValue = Number(acres);
  if (!Number.isFinite(acresValue)) return base;
  return Math.max(base, Math.min(base + Math.log10(Math.max(acresValue, 1)) * 3, base + 10));
}

function opacityForAge(ageHours) {
  const age = Number(ageHours);
  if (!Number.isFinite(age)) return 0.82;
  if (age <= 72) return 0.92;
  if (age <= 168) return 0.8;
  if (age <= 720) return 0.68;
  return 0.55;
}

function glowOpacityForAge(ageHours) {
  return Math.max(0.1, opacityForAge(ageHours) * 0.28);
}

function intensityMatches(properties) {
  if (state.intensity === "all") return true;
  return String(properties.intensity_class || "").toLowerCase() === state.intensity;
}

function representativeCoordinates(geometry) {
  if (!geometry || !geometry.type) return null;

  if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.slice(0, 2);
  }

  const queue = Array.isArray(geometry.coordinates) ? [...geometry.coordinates] : [];
  const points = [];

  while (queue.length) {
    const value = queue.shift();
    if (Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      points.push([value[0], value[1]]);
    } else if (Array.isArray(value)) {
      queue.push(...value);
    }
  }

  if (!points.length) return null;

  const sums = points.reduce((accumulator, point) => {
    return [accumulator[0] + point[0], accumulator[1] + point[1]];
  }, [0, 0]);

  return [sums[0] / points.length, sums[1] / points.length];
}

function sourceSummary(sources) {
  const labels = (Array.isArray(sources) ? sources : [])
    .map((source) => source && (source.id || source.title || source.url))
    .filter(Boolean);

  if (!labels.length) return "NASA EONET";
  return labels.join(", ");
}

function eventToFeature(event, fetchedAt) {
  const coordinates = representativeCoordinates(event.geometry);
  if (!coordinates) return null;

  const properties = event.properties || {};
  const eventDate = properties.date ? new Date(properties.date) : null;
  if (!eventDate || Number.isNaN(eventDate.getTime())) return null;

  const acres = Number(properties.magnitudeValue);
  const intensityClass = intensityClassForAcres(acres);
  const ageHours = Math.max(0, Math.round(((fetchedAt.getTime() - eventDate.getTime()) / 3600000) * 100) / 100);
  const sources = Array.isArray(properties.sources) ? properties.sources : [];
  const primarySource = sources[0] || {};

  return {
    type: "Feature",
    id: properties.id || `${properties.title || "wildfire"}:${properties.date || ""}`,
    geometry: {
      type: "Point",
      coordinates
    },
    properties: {
      event_id: properties.id || "",
      title: properties.title || "Wildfire event",
      description: properties.description || "",
      event_link: properties.link || "",
      source_label: sourceSummary(sources),
      source_url: primarySource.url || properties.link || EONET_DOCS_URL,
      source_count: sources.length,
      category: "Wildfires",
      reported_at_utc: eventDate.toISOString(),
      closed_at_utc: properties.closed || "",
      acres: Number.isFinite(acres) ? acres : null,
      magnitude_unit: properties.magnitudeUnit || "acres",
      latitude: Number(coordinates[1]),
      longitude: Number(coordinates[0]),
      age_hours: ageHours,
      intensity_class: intensityClass,
      intensity_label: INTENSITY_LABELS[intensityClass] || "Wildfire event"
    }
  };
}

function buildLiveCollection(features, periodLabel, generatedAt) {
  return {
    type: "FeatureCollection",
    metadata: {
      generated_at_utc: generatedAt.toISOString(),
      period_label: periodLabel,
      feature_count: features.length,
      source_name: "NASA EONET",
      disclaimer: "These are EONET wildfire events, which are lighter incident-style records rather than every satellite thermal detection."
    },
    features
  };
}

function normalizeFeature(feature) {
  const properties = { ...(feature.properties || {}) };
  const coordinates = feature.geometry && Array.isArray(feature.geometry.coordinates)
    ? feature.geometry.coordinates
    : [properties.longitude, properties.latitude];

  const intensityClass = String(properties.intensity_class || intensityClassForAcres(properties.acres)).toLowerCase();
  const markerRadius = radiusForIntensity(intensityClass, properties.acres);
  const markerOpacity = opacityForAge(properties.age_hours);

  return {
    type: "Feature",
    id: feature.id || properties.event_id || null,
    geometry: {
      type: "Point",
      coordinates: [Number(coordinates[0]), Number(coordinates[1])]
    },
    properties: {
      ...properties,
      intensity_class: intensityClass,
      intensity_label: INTENSITY_LABELS[intensityClass] || "Wildfire event",
      marker_colour: colourForIntensity(intensityClass),
      marker_radius: markerRadius,
      marker_opacity: markerOpacity,
      glow_opacity: glowOpacityForAge(properties.age_hours),
      marker_stroke: "rgba(255,255,255,0.92)"
    }
  };
}

function filteredFeaturesFrom(collection) {
  const features = Array.isArray(collection.features) ? collection.features : [];
  return features
    .map(normalizeFeature)
    .filter((feature) => intensityMatches(feature.properties));
}

function buildDisplayCollection(features, metadata = {}) {
  return {
    type: "FeatureCollection",
    metadata,
    features
  };
}

function updateStats(collection) {
  const features = Array.isArray(collection.features) ? collection.features : [];
  const maxAcres = features.reduce((maxValue, feature) => {
    const acres = Number(feature.properties.acres);
    return Number.isFinite(acres) ? Math.max(maxValue, acres) : maxValue;
  }, 0);
  const majorCount = features.filter((feature) => feature.properties.intensity_class === "extreme").length;

  elements.visibleCount.textContent = String(features.length);
  elements.highestFrp.textContent = formatAcres(maxAcres);
  elements.extremeCount.textContent = String(majorCount);
  elements.lastUpdate.textContent = formatLastUpdate(collection.metadata.generated_at_utc);
}

function setMapData(collection) {
  updateStats(collection);
  if (!map.getSource("fires")) return;
  map.getSource("fires").setData(collection);
}

function buildPopupHtml(properties, coordinates) {
  const intensityClass = String(properties.intensity_class || "low").toLowerCase();
  const headerColour = colourForIntensity(intensityClass);
  const descriptionBlock = properties.description
    ? `<p><strong>Description:</strong><br>${escapeHtml(properties.description)}</p>`
    : "";

  return `
    <div class="fire-popup">
      <div class="fire-popup-header" style="background:${headerColour}">
        <h2>${escapeHtml(formatValue(properties.title, "Wildfire event"))}</h2>
        <div class="subtitle">${escapeHtml(formatValue(properties.intensity_label, "Wildfire event"))}</div>
      </div>

      <div class="fire-popup-body">
        <div class="popup-grid">
          <div class="popup-metric">
            <span>Reported UTC</span>
            <strong>${escapeHtml(formatUtcDateTime(properties.reported_at_utc))}</strong>
          </div>

          <div class="popup-metric">
            <span>Estimated size</span>
            <strong>${escapeHtml(formatAcres(properties.acres))}</strong>
          </div>

          <div class="popup-metric">
            <span>Latitude / longitude</span>
            <strong>${escapeHtml(`${formatCoordinate(coordinates[1])}, ${formatCoordinate(coordinates[0])}`)}</strong>
          </div>

          <div class="popup-metric">
            <span>Detection age</span>
            <strong>${escapeHtml(formatAgeHours(properties.age_hours))}</strong>
          </div>

          <div class="popup-metric">
            <span>Source feed</span>
            <strong>${escapeHtml(formatValue(properties.source_label))}</strong>
          </div>

          <div class="popup-metric">
            <span>Event ID</span>
            <strong>${escapeHtml(formatValue(properties.event_id))}</strong>
          </div>
        </div>

        ${descriptionBlock}

        <a class="popup-link" href="${escapeHtml(properties.event_link || properties.source_url || EONET_DOCS_URL)}" target="_blank" rel="noopener">
          Open EONET event
        </a>

        <button class="popup-button" id="obsidian-note-button">
          Create Obsidian note
        </button>

        <button class="popup-button secondary" id="copy-markdown-button">
          Copy note markdown
        </button>

        <button class="popup-button secondary" id="copy-import-button">
          Copy + import to Obsidian
        </button>
      </div>
    </div>
  `;
}

function createObsidianMarkdown(properties, coordinates) {
  const lat = Number(coordinates[1]);
  const lon = Number(coordinates[0]);
  const eventDate = properties.reported_at_utc
    ? String(properties.reported_at_utc).slice(0, 10)
    : "";
  const title = `${formatValue(properties.title, "Wildfire event")} (${lat.toFixed(3)}, ${lon.toFixed(3)})`;

  return `---
Date: ${eventDate}
Link: ${frontMatterScalar(properties.event_link || properties.source_url || EONET_DOCS_URL)}
aliases:
  - "${title}"
Source: "[[NASA EONET]]"
Event_ID: ${frontMatterScalar(properties.event_id)}
Reported_UTC: ${frontMatterScalar(properties.reported_at_utc)}
Estimated_Size_Acres: ${frontMatterScalar(properties.acres)}
Source_Feed: ${frontMatterScalar(properties.source_label)}
Location: ${lat},${lon}
tags:
  - Geoscience
  - Geohazards
  - Wildfire
  - NASA-EONET
---

# ${title}

## Quick summary

This note records a wildfire event from [[NASA EONET]] for linking and later review.

The event was reported on **${formatUtcDateTime(properties.reported_at_utc)}** with an estimated size of **${formatAcres(properties.acres)}**.

## Event details

| Field | Value |
|---|---|
| Title | ${formatValue(properties.title)} |
| Reported UTC | ${formatUtcDateTime(properties.reported_at_utc)} |
| Estimated size | ${formatAcres(properties.acres)} |
| Latitude | ${lat.toFixed(4)} |
| Longitude | ${lon.toFixed(4)} |
| Source feed | ${formatValue(properties.source_label)} |
| Event ID | ${formatValue(properties.event_id)} |
| Detection age | ${formatAgeHours(properties.age_hours)} |

## Notes

${formatValue(properties.description, "")}

## Reference

[^1]: [NASA EONET wildfire event](${frontMatterScalar(properties.event_link || properties.source_url || EONET_DOCS_URL)})
`;
}

function safeFileName(text) {
  return String(text)
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function openEventInObsidian(properties, coordinates) {
  const markdown = createObsidianMarkdown(properties, coordinates);
  const timestamp = properties.reported_at_utc
    ? String(properties.reported_at_utc).slice(0, 10)
    : "unknown-date";
  const fileName = safeFileName(
    `Wildfire - ${properties.title || "Unknown"} - ${timestamp}`
  );
  const obsidianUrl =
    "obsidian://new?" +
    "name=" + encodeURIComponent(fileName) +
    "&content=" + encodeURIComponent(markdown);

  window.open(obsidianUrl, obsidianUrl);
}

async function copyEventMarkdown(properties, coordinates) {
  const markdown = createObsidianMarkdown(properties, coordinates);

  try {
    await navigator.clipboard.writeText(markdown);
    alert("Wildfire note copied. Paste it into Obsidian.");
  } catch (error) {
    console.error(error);
    const textArea = document.createElement("textarea");
    textArea.value = markdown;
    document.body.appendChild(textArea);
    textArea.select();

    try {
      document.execCommand("copy");
      alert("Wildfire note copied. Paste it into Obsidian.");
    } catch (fallbackError) {
      alert("Could not copy automatically. Open the map in your browser instead.");
    }

    document.body.removeChild(textArea);
  }
}

async function copyAndImportEventMarkdown(properties, coordinates) {
  const markdown = createObsidianMarkdown(properties, coordinates);

  try {
    await navigator.clipboard.writeText(markdown);
    setTimeout(() => {
      window.location.href = QUICK_ADD_IMPORT_URI;
    }, 300);
  } catch (error) {
    console.error(error);
    const textArea = document.createElement("textarea");
    textArea.value = markdown;
    document.body.appendChild(textArea);
    textArea.select();

    try {
      document.execCommand("copy");
      setTimeout(() => {
        window.location.href = QUICK_ADD_IMPORT_URI;
      }, 300);
    } catch (fallbackError) {
      alert("Could not copy automatically. Copy the note markdown first, then run the QuickAdd command manually.");
    }

    document.body.removeChild(textArea);
  }
}

async function loadDataset(periodKey) {
  if (state.cache.has(periodKey)) {
    return state.cache.get(periodKey);
  }

  const dataset = DATASETS[periodKey];
  const params = new URLSearchParams({
    category: "wildfires",
    status: "open",
    days: String(dataset.days)
  });

  const response = await fetch(`${EONET_EVENTS_URL}?${params.toString()}`, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`EONET returned ${response.status}`);
  }

  const payload = await response.json();
  const fetchedAt = new Date();
  const features = (Array.isArray(payload.features) ? payload.features : [])
    .map((feature) => eventToFeature(feature, fetchedAt))
    .filter(Boolean);

  const data = buildLiveCollection(features, dataset.label, fetchedAt);
  state.cache.set(periodKey, data);
  return data;
}

async function refreshMapForCurrentState() {
  const requestId = ++state.activeRequestId;
  elements.lastUpdate.textContent = "loading";
  setStatusMessage("");

  try {
    const collection = await loadDataset(state.period);
    if (requestId !== state.activeRequestId) return;

    state.currentCollection = collection;
    const displayFeatures = filteredFeaturesFrom(collection);
    const displayCollection = buildDisplayCollection(displayFeatures, {
      ...(collection.metadata || {}),
      visible_event_count: displayFeatures.length
    });
    setMapData(displayCollection);

    if (!Array.isArray(collection.features) || collection.features.length === 0) {
      setStatusMessage("No EONET wildfire events were returned for this period.");
    } else if (displayFeatures.length < collection.features.length) {
      setStatusMessage(`Showing ${formatCount(displayFeatures.length)} filtered wildfire events from ${formatCount(collection.features.length)} open EONET events.`);
    }
  } catch (error) {
    console.error(error);
    state.currentCollection = buildDisplayCollection([], {
      generated_at_utc: null
    });
    setMapData(state.currentCollection);
    elements.lastUpdate.textContent = "error";
    setStatusMessage("Could not load live EONET wildfire data. Check browser network access and try again.");
  }
}

function bindControls() {
  elements.periodSelect.addEventListener("change", (event) => {
    state.period = event.target.value;
    refreshMapForCurrentState();
  });

  elements.intensitySelect.addEventListener("change", (event) => {
    state.intensity = event.target.value;
    refreshMapForCurrentState();
  });
}

function attachPopupHandlers(popup, properties, coordinates) {
  const popupElement = popup.getElement();
  const obsidianButton = popupElement.querySelector("#obsidian-note-button");
  const copyMarkdownButton = popupElement.querySelector("#copy-markdown-button");
  const copyImportButton = popupElement.querySelector("#copy-import-button");

  if (obsidianButton) {
    obsidianButton.addEventListener("click", () => {
      openEventInObsidian(properties, coordinates);
    });
  }

  if (copyMarkdownButton) {
    copyMarkdownButton.addEventListener("click", () => {
      copyEventMarkdown(properties, coordinates);
    });
  }

  if (copyImportButton) {
    copyImportButton.addEventListener("click", () => {
      copyAndImportEventMarkdown(properties, coordinates);
    });
  }
}

function initialiseMapLayers() {
  map.addSource("fires", {
    type: "geojson",
    data: buildDisplayCollection([]),
    cluster: true,
    clusterRadius: 52,
    clusterMaxZoom: 7
  });

  map.addLayer({
    id: "fire-clusters",
    type: "circle",
    source: "fires",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "step",
        ["get", "point_count"],
        "#ffb347",
        10,
        "#ff8a3d",
        30,
        "#ff5c39",
        60,
        "#d7263d"
      ],
      "circle-radius": [
        "step",
        ["get", "point_count"],
        16,
        10,
        22,
        30,
        30,
        60,
        38
      ],
      "circle-opacity": 0.84,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#ffffff"
    }
  });

  map.addLayer({
    id: "fire-cluster-count",
    type: "symbol",
    source: "fires",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Open Sans Bold"],
      "text-size": 12
    },
    paint: {
      "text-color": "#ffffff"
    }
  });

  map.addLayer({
    id: "fire-glow",
    type: "circle",
    source: "fires",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["*", ["get", "marker_radius"], 1.8],
      "circle-color": ["get", "marker_colour"],
      "circle-opacity": ["get", "glow_opacity"]
    }
  });

  map.addLayer({
    id: "fire-points",
    type: "circle",
    source: "fires",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["get", "marker_radius"],
      "circle-color": ["get", "marker_colour"],
      "circle-opacity": ["get", "marker_opacity"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.2
    }
  });

  map.on("click", "fire-clusters", (event) => {
    const feature = map.queryRenderedFeatures(event.point, {
      layers: ["fire-clusters"]
    })[0];
    const clusterId = feature.properties.cluster_id;

    map.getSource("fires").getClusterExpansionZoom(clusterId, (error, zoom) => {
      if (error) return;

      map.easeTo({
        center: feature.geometry.coordinates,
        zoom
      });
    });
  });

  map.on("click", "fire-points", (event) => {
    const feature = event.features[0];
    const properties = feature.properties;
    const coordinates = feature.geometry.coordinates.slice();

    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: "340px",
      offset: 18,
      focusAfterOpen: false
    })
      .setLngLat(coordinates)
      .setHTML(buildPopupHtml(properties, coordinates))
      .addTo(map);

    attachPopupHandlers(popup, properties, coordinates);
  });

  ["fire-clusters", "fire-points"].forEach((layerId) => {
    map.on("mouseenter", layerId, () => {
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", layerId, () => {
      map.getCanvas().style.cursor = "";
    });
  });
}

bindControls();

map.on("load", () => {
  initialiseMapLayers();
  refreshMapForCurrentState();
  setInterval(() => {
    state.cache.clear();
    refreshMapForCurrentState();
  }, 10 * 60 * 1000);
});
