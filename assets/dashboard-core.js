(function () {
  const DEFAULT_TIME_FORMAT = new Intl.DateTimeFormat([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });

  const DEFAULT_DATE_FORMAT = new Intl.DateTimeFormat([], {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function slugify(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase();
  }

  function formatDateTime(value) {
    if (!value) return "not available";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "not available";
    return DEFAULT_TIME_FORMAT.format(date);
  }

  function formatDate(value) {
    if (!value) return "not available";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "not available";
    return DEFAULT_DATE_FORMAT.format(date);
  }

  function formatRelativeTime(value) {
    if (!value) return "recently";
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return "recently";
    const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
  }

  function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function loadJson(url) {
    return fetch(url, { cache: "no-store" }).then((response) => {
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }

      return response.json();
    });
  }

  function representativePoint(geometry) {
    if (!geometry || !geometry.type || !Array.isArray(geometry.coordinates)) {
      return null;
    }

    if (geometry.type === "Point" && geometry.coordinates.length >= 2) {
      return geometry.coordinates.slice(0, 2);
    }

    const points = [];
    const queue = [geometry.coordinates];

    while (queue.length) {
      const current = queue.shift();
      if (!Array.isArray(current)) continue;

      if (current.length >= 2 && typeof current[0] === "number" && typeof current[1] === "number") {
        points.push([current[0], current[1]]);
        continue;
      }

      current.forEach((item) => queue.push(item));
    }

    if (!points.length) return null;

    const totals = points.reduce((accumulator, point) => {
      accumulator[0] += point[0];
      accumulator[1] += point[1];
      return accumulator;
    }, [0, 0]);

    return [totals[0] / points.length, totals[1] / points.length];
  }

  function classifySeverity(source, properties) {
    const severity = String(properties.severity || properties.alert || properties.impact_class || "").toLowerCase();
    const magnitude = toNumber(properties.mag || properties.magnitude || properties.magnitudeValue);
    const sourceId = String(source.id || "");

    if (sourceId.includes("earthquake")) {
      if (magnitude === null) return severity || "moderate";
      if (magnitude >= 7) return "extreme";
      if (magnitude >= 6) return "major";
      if (magnitude >= 5) return "moderate";
      return "minor";
    }

    if (severity) {
      return severity;
    }

    if (sourceId.includes("wildfire")) return "moderate";
    if (sourceId.includes("alert")) return "moderate";

    return "unknown";
  }

  function classifyStatus(source, properties) {
    const raw = String(properties.status || properties.event_status || properties.state || "").toLowerCase();
    if (raw) {
      if (raw.includes("closed") || raw.includes("ended") || raw.includes("inactive")) return "closed";
      if (raw.includes("active") || raw.includes("open") || raw.includes("ongoing")) return "active";
      return raw;
    }

    if (String(source.data_mode || source.access_mode || "").toLowerCase() === "live") {
      return "active";
    }

    return "unknown";
  }

  function titleCase(value) {
    return String(value || "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function subtypeForSource(source, properties, feature) {
    if (source.subtype) return source.subtype;
    const category = feature?.categories?.[0]?.title || feature?.categories?.[0]?.id || properties.event || properties.headline || "";
    return slugify(category) || "event";
  }

  function buildBaseEvent(source, properties, geometry, recordUrl, extra = {}) {
    const coordinates = representativePoint(geometry);
    const lon = coordinates ? toNumber(coordinates[0]) : null;
    const lat = coordinates ? toNumber(coordinates[1]) : null;
    const start = properties.date || properties.time || properties.effective || properties.onset || properties.seendate || properties.updated || properties.created || properties.published || extra.date_start || null;
    const updated = properties.updated || properties.time || properties.date || start || extra.date_updated || null;
    const title = properties.title || properties.headline || properties.event || extra.title || source.name;
    const summary = properties.description || properties.summary || properties.body || properties.abstract || extra.summary || "";
    const sourceUrl = source.url || "";

    return {
      event_id: extra.event_id || properties.id || properties.event_id || recordUrl || `${source.id}:${slugify(title)}:${start || "unknown"}`,
      title,
      event_type: extra.event_type || source.event_type || "natural_hazard",
      subtype: extra.subtype || subtypeForSource(source, properties, extra.feature),
      date_start: start,
      date_updated: updated,
      country: extra.country || properties.country || properties.country_code || "",
      region: extra.region || properties.areaDesc || properties.place || properties.sourceCountry || "",
      latitude: lat,
      longitude: lon,
      severity: extra.severity || classifySeverity(source, properties),
      status: extra.status || classifyStatus(source, properties),
      source_name: source.name,
      source_url: sourceUrl,
      source_record_url: recordUrl || properties.uri || properties.link || sourceUrl,
      summary,
      confidence: extra.confidence || source.confidence || "medium",
      tags: Array.isArray(extra.tags) ? extra.tags : [source.category, source.subtype].filter(Boolean),
      map_page: extra.map_page || "../events/",
      data_mode: source.data_mode || source.access_mode || "live",
      license: source.license || "Source-specific",
      attribution: source.attribution || source.name,
      source_id: source.id,
      source_category: source.category,
      source_adapter: source.adapter,
      source_refresh_minutes: source.refresh_interval_minutes || null,
      grouped_source_count: 1,
      grouped_sources: [
        {
          source_id: source.id,
          source_name: source.name,
          source_url: source.url,
          source_record_url: recordUrl || properties.uri || properties.link || source.url,
          data_mode: source.data_mode || source.access_mode || "live"
        }
      ],
      ...extra
    };
  }

  function normalizeGeoJsonRecord(source, feature) {
    const properties = feature.properties || {};
    const recordUrl = properties.url || properties.link || properties.uri || properties.details || source.url;
    const extra = {
      confidence: source.confidence || "medium",
      tags: [source.category, source.subtype, properties.category || properties.type].filter(Boolean),
      map_page: source.subtype === "earthquake" ? "../earthquakes/" : source.subtype === "wildfire" ? "../wildfires/" : "../events/",
      summary: properties.description || properties.title || source.name,
      feature
    };

    if (source.adapter === "nws-alerts") {
      extra.event_type = "natural_hazard";
      extra.subtype = slugify(properties.event || source.subtype || "alert") || "alert";
      extra.severity = String(properties.severity || "unknown").toLowerCase();
      extra.status = String(properties.status || "active").toLowerCase();
      extra.confidence = String(properties.certainty || "medium").toLowerCase();
      extra.tags = ["weather", String(properties.event || "").toLowerCase(), String(properties.severity || "").toLowerCase()].filter(Boolean);
      extra.map_page = "../events/";
      extra.summary = [properties.headline, properties.description].filter(Boolean).join("\n\n");
    }

    if (source.subtype === "earthquake") {
      extra.summary = properties.place ? `${properties.place} · M${properties.mag || "?"}` : source.name;
      extra.severity = classifySeverity(source, properties);
      extra.map_page = "../earthquakes/";
      extra.tags = ["earthquake", "usgs", properties.tsunami ? "tsunami" : ""].filter(Boolean);
      extra.confidence = "high";
      extra.status = String(properties.status || "reviewed").toLowerCase();
    }

    if (source.subtype === "wildfire") {
      extra.map_page = "../wildfires/";
      extra.summary = properties.description || properties.title || source.name;
      extra.status = properties.closed ? "closed" : "active";
      extra.severity = classifySeverity(source, properties);
    }

    return buildBaseEvent(source, properties, feature.geometry, recordUrl, extra);
  }

  function normalizeEpicRecord(source, record) {
    const properties = {
      title: record.caption || record.image || source.name,
      description: record.caption || source.name,
      date: record.date || null
    };

    return buildBaseEvent(source, properties, null, `${source.url}/${record.image || record.date || ""}`, {
      event_type: "satellite",
      subtype: "earth-observation",
      confidence: "high",
      severity: "informational",
      status: "active",
      summary: record.caption || "NASA EPIC image",
      tags: ["satellite", "earth-observation", "nasa"],
      map_page: "../satellite/",
      date_start: record.date ? `${record.date}T00:00:00Z` : null,
      date_updated: record.date ? `${record.date}T00:00:00Z` : null,
      latitude: null,
      longitude: null,
      record
    });
  }

  function normalizeGdeltRecord(source, record) {
    const properties = {
      title: record.title || source.name,
      description: record.seendate ? `Reported ${record.seendate}` : record.url || ""
    };

    return buildBaseEvent(source, properties, null, record.url || source.url, {
      event_type: "conflict",
      subtype: "reported_event",
      confidence: record.confidence ? String(record.confidence).toLowerCase() : "medium",
      severity: "unknown",
      status: "reported",
      summary: record.title || record.url || source.name,
      tags: ["conflict", "reported-event", record.sourcecountry || ""].filter(Boolean),
      map_page: "../conflict/",
      date_start: record.seendate || record.datetime || null,
      date_updated: record.seendate || record.datetime || null,
      country: record.sourcecountry || "",
      region: record.domain || "",
      latitude: null,
      longitude: null,
      record
    });
  }

  function uniqueById(events) {
    const seen = new Map();
    events.forEach((event) => {
      const key = event.event_id || `${event.source_id}:${event.title}:${event.date_start || ""}`;
      if (!seen.has(key)) {
        seen.set(key, { ...event });
        return;
      }

      const existing = seen.get(key);
      existing.grouped_source_count += 1;
      existing.grouped_sources = [...existing.grouped_sources, ...event.grouped_sources];
    });

    return Array.from(seen.values());
  }

  function groupSimilarEvents(events) {
    const groups = new Map();

    events.forEach((event) => {
      const timeBucket = event.date_start ? String(event.date_start).slice(0, 13) : "no-time";
      const coordBucket = event.latitude !== null && event.longitude !== null
        ? `${Math.round(event.latitude * 4) / 4},${Math.round(event.longitude * 4) / 4}`
        : "no-coords";
      const titleBucket = slugify(event.title).slice(0, 50);
      const key = [event.event_type, event.subtype, timeBucket, coordBucket, titleBucket].join("|");

      if (!groups.has(key)) {
        groups.set(key, { ...event, grouped_sources: [...event.grouped_sources] });
        return;
      }

      const existing = groups.get(key);
      existing.grouped_source_count += 1;
      existing.grouped_sources = [...existing.grouped_sources, ...event.grouped_sources];
      if (!existing.date_updated || (event.date_updated && String(event.date_updated) > String(existing.date_updated))) {
        existing.date_updated = event.date_updated;
      }
      if (!existing.summary && event.summary) {
        existing.summary = event.summary;
      }
    });

    return Array.from(groups.values()).sort((left, right) => {
      return String(right.date_updated || right.date_start || "").localeCompare(String(left.date_updated || left.date_start || ""));
    });
  }

  function noteFrontMatterValue(value) {
    if (value === null || value === undefined || value === "") return "";
    return String(value).replace(/"/g, "\\\"");
  }

  function buildObsidianNote(event) {
    const date = event.date_start ? String(event.date_start).slice(0, 10) : "";
    const lat = event.latitude === null || event.latitude === undefined ? "" : Number(event.latitude).toFixed(5);
    const lon = event.longitude === null || event.longitude === undefined ? "" : Number(event.longitude).toFixed(5);
    const tags = Array.isArray(event.tags) ? event.tags.filter(Boolean) : [];
    const sourceLinks = (event.grouped_sources || []).map((source) => `- [${source.source_name}](${source.source_record_url || source.source_url || event.source_url})`).join("\n");

    return `---
title: "${noteFrontMatterValue(event.title)}"
date: ${date}
event_type: ${noteFrontMatterValue(event.event_type)}
subtype: ${noteFrontMatterValue(event.subtype)}
severity: ${noteFrontMatterValue(event.severity)}
status: ${noteFrontMatterValue(event.status)}
country:
  - ${noteFrontMatterValue(event.country)}
region: ${noteFrontMatterValue(event.region)}
source: ${noteFrontMatterValue(event.source_name)}
source_url: ${noteFrontMatterValue(event.source_url)}
source_record_url: ${noteFrontMatterValue(event.source_record_url)}
data_mode: ${noteFrontMatterValue(event.data_mode)}
confidence: ${noteFrontMatterValue(event.confidence)}
license: ${noteFrontMatterValue(event.license)}
attribution: ${noteFrontMatterValue(event.attribution)}
tags:
${tags.length ? tags.map((tag) => `  - ${noteFrontMatterValue(tag)}`).join("\n") : "  - event"}
uplink: "[[Global Events]]"
---

# Summary

${event.summary || ""}

## Key facts

- Event type: ${event.event_type}
- Subtype: ${event.subtype}
- Severity: ${event.severity}
- Status: ${event.status}
- Confidence: ${event.confidence}

## Location

- Latitude: ${lat}
- Longitude: ${lon}

## Source and attribution

- Source: ${event.source_name}
- Source URL: ${event.source_url}
- Source record: ${event.source_record_url}
- Attribution: ${event.attribution}
- Licence: ${event.license}

## Related notes

${sourceLinks || "- None yet"}
`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();

      try {
        const copied = document.execCommand("copy");
        document.body.removeChild(textarea);
        return copied;
      } catch (fallbackError) {
        document.body.removeChild(textarea);
        return false;
      }
    }
  }

  function sourceStatusLabel(source) {
    const mode = String(source.access_mode || source.data_mode || "external").toLowerCase();
    if (mode === "live") return "Live";
    if (mode === "cached") return "Cached";
    if (mode === "manual") return "Manual";
    return "External";
  }

  function mapPageForEvent(event, basePath = "..") {
    const subtype = String(event.subtype || "").toLowerCase();
    if (subtype === "earthquake") return `${basePath}/earthquakes/`;
    if (subtype === "wildfire") return `${basePath}/wildfires/`;
    if (["flood", "storm", "cyclone", "heatwave", "drought", "tsunami"].includes(subtype)) return `${basePath}/floods/`;
    if (["volcano", "landslide"].includes(subtype)) return `${basePath}/volcanoes/`;
    if (String(event.event_type || "").toLowerCase() === "conflict") return `${basePath}/conflict/`;
    if (["satellite", "climate"].includes(String(event.event_type || "").toLowerCase())) return `${basePath}/satellite/`;
    return `${basePath}/events/`;
  }

  async function loadRegistry(configUrl) {
    const payload = await loadJson(configUrl);
    const sources = Array.isArray(payload.sources) ? payload.sources : [];
    return sources.map((source) => ({
      ...source,
      data_mode: source.data_mode || source.access_mode || "external"
    }));
  }

  async function loadSourceEvents(source) {
    const adapter = String(source.adapter || source.type || "").toLowerCase();

    if (source.access_mode !== "live" || source.requires_proxy || source.access_mode === "external" || source.access_mode === "manual") {
      return { source, events: [], status: sourceStatusLabel(source), updated_at: null, error: null };
    }

    try {
      if (adapter === "geojson") {
        const payload = await loadJson(source.url);
        const features = Array.isArray(payload.features) ? payload.features : [];
        const events = features.map((feature) => normalizeGeoJsonRecord(source, feature)).filter(Boolean);
        const updatedAt = payload.metadata?.generated || payload.metadata?.generated_at || payload.updated || new Date().toISOString();
        return { source, events, status: sourceStatusLabel(source), updated_at: updatedAt, error: null };
      }

      if (adapter === "nws-alerts") {
        const payload = await loadJson(source.url);
        const features = Array.isArray(payload.features) ? payload.features : [];
        const events = features.map((feature) => normalizeGeoJsonRecord(source, feature)).filter(Boolean);
        return { source, events, status: sourceStatusLabel(source), updated_at: payload?.updated || new Date().toISOString(), error: null };
      }

      if (adapter === "epic") {
        const payload = await loadJson(source.url);
        const events = Array.isArray(payload) ? payload.map((record) => normalizeEpicRecord(source, record)).filter(Boolean) : [];
        return { source, events, status: sourceStatusLabel(source), updated_at: events[0]?.date_start || new Date().toISOString(), error: null };
      }

      if (adapter === "gdelt-doc") {
        const payload = await loadJson(source.url);
        const records = Array.isArray(payload?.articles) ? payload.articles : Array.isArray(payload?.items) ? payload.items : [];
        const events = records.map((record) => normalizeGdeltRecord(source, record)).filter(Boolean);
        return { source, events, status: sourceStatusLabel(source), updated_at: events[0]?.date_start || new Date().toISOString(), error: null };
      }

      return { source, events: [], status: sourceStatusLabel(source), updated_at: null, error: new Error(`Unsupported adapter: ${adapter}`) };
    } catch (error) {
      if (source.cache_file) {
        try {
          const fallback = await loadJson(source.cache_file);
          const fallbackEvents = Array.isArray(fallback?.events)
            ? fallback.events.filter((event) => String(event.source_id || "") === String(source.id))
            : [];
          if (fallbackEvents.length) {
            return {
              source,
              events: fallbackEvents,
              status: "Cached",
              updated_at: fallback.generated_at || new Date().toISOString(),
              error: null
            };
          }
        } catch (fallbackError) {
          return { source, events: [], status: sourceStatusLabel(source), updated_at: null, error };
        }
      }

      return { source, events: [], status: sourceStatusLabel(source), updated_at: null, error };
    }
  }

  async function loadEventCatalog(options = {}) {
    const configUrl = options.configUrl || "./config/data-sources.json";
    const registry = Array.isArray(options.registry) ? options.registry : await loadRegistry(configUrl);
    const requestedSourceIds = Array.isArray(options.sourceIds) ? new Set(options.sourceIds) : null;
    const requestedCategories = Array.isArray(options.categories) ? new Set(options.categories) : null;

    const selectedSources = registry.filter((source) => {
      if (requestedSourceIds && !requestedSourceIds.has(source.id)) return false;
      if (requestedCategories && !requestedCategories.has(source.category)) return false;
      return true;
    });

    const results = await Promise.all(selectedSources.map((source) => loadSourceEvents(source)));
    const liveEvents = results.flatMap((result) => result.events || []);
    const groupedEvents = groupSimilarEvents(uniqueById(liveEvents));

    return {
      generated_at: new Date().toISOString(),
      registry,
      sources: results,
      events: groupedEvents,
      event_count: groupedEvents.length,
      source_count: registry.length,
      live_source_count: results.filter((result) => String(result.source.access_mode || result.source.data_mode || "").toLowerCase() === "live").length,
      active_source_count: results.filter((result) => (result.events || []).length).length
    };
  }

  function eventMatchesFilters(event, filters) {
    const search = String(filters.search || "").toLowerCase().trim();
    const subtype = String(filters.subtype || "all").toLowerCase();
    const eventType = String(filters.event_type || "all").toLowerCase();
    const sourceId = String(filters.source_id || "all").toLowerCase();
    const severity = String(filters.severity || "all").toLowerCase();
    const status = String(filters.status || "all").toLowerCase();
    const mode = String(filters.data_mode || "all").toLowerCase();
    const requireCoords = Boolean(filters.requireCoords);
    const onlyActive = Boolean(filters.onlyActive);
    const onlyMajor = Boolean(filters.onlyMajor);

    if (eventType !== "all" && String(event.event_type || "").toLowerCase() !== eventType) return false;
    if (subtype !== "all" && String(event.subtype || "").toLowerCase() !== subtype) return false;
    if (sourceId !== "all" && String(event.source_id || "").toLowerCase() !== sourceId) return false;
    if (severity !== "all" && String(event.severity || "").toLowerCase() !== severity) return false;
    if (status !== "all" && String(event.status || "").toLowerCase() !== status) return false;
    if (mode !== "all" && String(event.data_mode || "").toLowerCase() !== mode) return false;
    if (requireCoords && (event.latitude === null || event.longitude === null)) return false;
    if (onlyActive && !String(event.status || "").toLowerCase().includes("active") && !String(event.status || "").toLowerCase().includes("open")) return false;
    if (onlyMajor && !["major", "extreme", "severe"].includes(String(event.severity || "").toLowerCase())) return false;

    if (!search) return true;

    const haystack = [
      event.title,
      event.summary,
      event.event_type,
      event.subtype,
      event.country,
      event.region,
      event.source_name,
      event.source_record_url,
      event.source_url,
      ...(event.tags || [])
    ].join(" ").toLowerCase();

    return haystack.includes(search);
  }

  function filterEvents(events, filters) {
    let filtered = events.filter((event) => eventMatchesFilters(event, filters));

    const range = String(filters.time_range || "all").toLowerCase();
    if (range !== "all") {
      const now = Date.now();
      const windows = {
        "24h": 24 * 60 * 60 * 1000,
        "7d": 7 * 24 * 60 * 60 * 1000,
        "30d": 30 * 24 * 60 * 60 * 1000
      };
      const windowMs = windows[range];
      if (windowMs) {
        filtered = filtered.filter((event) => {
          const value = new Date(event.date_start || event.date_updated || 0).getTime();
          return Number.isFinite(value) && value >= now - windowMs;
        });
      }
    }

    return filtered;
  }

  window.DashboardHub = {
    escapeHtml,
    slugify,
    formatDateTime,
    formatDate,
    formatRelativeTime,
    representativePoint,
    loadJson,
    loadRegistry,
    loadEventCatalog,
    filterEvents,
    eventMatchesFilters,
    mapPageForEvent,
    copyText,
    buildObsidianNote,
    sourceStatusLabel,
    titleCase
  };
})();