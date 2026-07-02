(function () {
  const state = {
    registry: [],
    sources: [],
    events: [],
    filteredEvents: [],
    activeEvent: null,
    page: 0,
    pageSize: 20,
    loading: false,
    filters: {
      search: "",
      event_type: "all",
      subtype: "all",
      source_id: "all",
      severity: "all",
      status: "all",
      data_mode: "all",
      time_range: "all",
      onlyActive: false,
      onlyMajor: false,
      requireCoords: false
    }
  };

  const els = {};

  function qs(id) {
    return document.getElementById(id);
  }

  function bindElements() {
    els.sourceStatusText = qs("sourceStatusText");
    els.sourceStatusList = qs("sourceStatusList");
    els.eventCount = qs("eventCount");
    els.activeSourceCount = qs("activeSourceCount");
    els.lastUpdateLabel = qs("lastUpdateLabel");
    els.searchInput = qs("searchInput");
    els.eventTypeSelect = qs("eventTypeSelect");
    els.subtypeSelect = qs("subtypeSelect");
    els.sourceSelect = qs("sourceSelect");
    els.severitySelect = qs("severitySelect");
    els.statusSelect = qs("statusSelect");
    els.modeSelect = qs("modeSelect");
    els.timeRangeSelect = qs("timeRangeSelect");
    els.onlyActiveCheckbox = qs("onlyActiveCheckbox");
    els.onlyMajorCheckbox = qs("onlyMajorCheckbox");
    els.onlyCoordsCheckbox = qs("onlyCoordsCheckbox");
    els.refreshButton = qs("refreshButton");
    els.resetButton = qs("resetButton");
    els.tableState = qs("tableState");
    els.tableWrap = qs("tableWrap");
    els.eventTableBody = qs("eventTableBody");
    els.resultCountText = qs("resultCountText");
    els.prevPageButton = qs("prevPageButton");
    els.nextPageButton = qs("nextPageButton");
    els.detailState = qs("detailState");
    els.liveModePill = qs("liveModePill");
    els.cachedModePill = qs("cachedModePill");
    els.externalModePill = qs("externalModePill");
  }

  function setEmptyState(message, className) {
    els.tableState.className = className || "loading";
    els.tableState.textContent = message;
    els.tableState.hidden = false;
    els.tableWrap.hidden = true;
    els.resultCountText.textContent = message;
  }

  function optionMarkup(value, label, selected = false) {
    return `<option value="${DashboardHub.escapeHtml(value)}"${selected ? " selected" : ""}>${DashboardHub.escapeHtml(label)}</option>`;
  }

  function populateSelect(selectEl, options, selectedValue) {
    selectEl.innerHTML = options.map((item) => optionMarkup(item.value, item.label, item.value === selectedValue)).join("");
  }

  function updateSourceRegistryPanel() {
    const sources = state.registry || [];
    const liveSources = sources.filter((source) => String(source.access_mode || source.data_mode || "").toLowerCase() === "live");

    if (!sources.length) {
      els.sourceStatusText.textContent = "No sources were loaded from the registry.";
      els.sourceStatusList.innerHTML = '<div class="empty">The source registry is empty.</div>';
      return;
    }

    els.sourceStatusText.textContent = `${sources.length} configured sources · ${liveSources.length} live sources`;
    els.sourceStatusList.innerHTML = sources.map((source) => {
      const mode = DashboardHub.slugify(DashboardHub.sourceStatusLabel(source));
      return `
        <article class="source-item">
          <div class="source-meta">
            <span class="pill ${mode}">${DashboardHub.escapeHtml(DashboardHub.sourceStatusLabel(source))}</span>
            <span class="badge">${DashboardHub.escapeHtml(source.category || "source")}</span>
            <span class="badge">${DashboardHub.escapeHtml(source.subtype || source.event_type || "")}</span>
          </div>
          <h3 style="margin-top:10px;">${DashboardHub.escapeHtml(source.name)}</h3>
          <p style="margin-top:8px;">${DashboardHub.escapeHtml(source.attribution || source.documentation_url || source.url)}</p>
          <div class="source-links" style="margin-top:10px;">
            <a class="small-link" href="${DashboardHub.escapeHtml(source.documentation_url || source.url)}" target="_blank" rel="noopener">Source docs</a>
            <a class="small-link" href="${DashboardHub.escapeHtml(source.url)}" target="_blank" rel="noopener">Source endpoint</a>
          </div>
        </article>
      `;
    }).join("");
  }

  function buildFilterOptions() {
    const eventTypes = ["all", ...new Set(state.events.map((event) => event.event_type).filter(Boolean))];
    const subtypes = ["all", ...new Set(state.events.map((event) => event.subtype).filter(Boolean))];
    const sourceIds = ["all", ...state.registry.map((source) => source.id)];
    const severities = ["all", ...new Set(state.events.map((event) => event.severity).filter(Boolean))];
    const statuses = ["all", ...new Set(state.events.map((event) => event.status).filter(Boolean))];
    const modes = ["all", ...new Set(state.events.map((event) => event.data_mode).filter(Boolean))];

    populateSelect(els.eventTypeSelect, eventTypes.map((value) => ({ value, label: value === "all" ? "All types" : DashboardHub.titleCase(value) })), state.filters.event_type);
    populateSelect(els.subtypeSelect, subtypes.map((value) => ({ value, label: value === "all" ? "All subtypes" : DashboardHub.titleCase(value) })), state.filters.subtype);
    populateSelect(els.sourceSelect, sourceIds.map((value) => ({ value, label: value === "all" ? "All sources" : (state.registry.find((source) => source.id === value)?.name || value) })), state.filters.source_id);
    populateSelect(els.severitySelect, severities.map((value) => ({ value, label: value === "all" ? "All severities" : DashboardHub.titleCase(value) })), state.filters.severity);
    populateSelect(els.statusSelect, statuses.map((value) => ({ value, label: value === "all" ? "All statuses" : DashboardHub.titleCase(value) })), state.filters.status);
    populateSelect(els.modeSelect, modes.map((value) => ({ value, label: value === "all" ? "All modes" : DashboardHub.titleCase(value) })), state.filters.data_mode);
    populateSelect(els.timeRangeSelect, [
      { value: "all", label: "All available" },
      { value: "24h", label: "Last 24 hours" },
      { value: "7d", label: "Last 7 days" },
      { value: "30d", label: "Last 30 days" }
    ], state.filters.time_range);
  }

  function updateSummaryCounts() {
    const counts = state.events.reduce((accumulator, event) => {
      const mode = String(event.data_mode || "").toLowerCase();
      accumulator[mode] = (accumulator[mode] || 0) + 1;
      return accumulator;
    }, {});

    els.eventCount.textContent = String(state.filteredEvents.length);
    els.activeSourceCount.textContent = String(state.sources.filter((source) => (source.events || []).length).length);
    els.lastUpdateLabel.textContent = state.events.length ? DashboardHub.formatDateTime(state.events[0].date_updated || state.events[0].date_start) : "loading";
    els.liveModePill.textContent = `${counts.live || 0} live`;
    els.cachedModePill.textContent = `${counts.cached || 0} cached`;
    els.externalModePill.textContent = `${counts.external || 0} external`;
  }

  function renderDetail(event) {
    state.activeEvent = event;

    if (!event) {
      els.detailState.innerHTML = '<div class="empty">Choose an event row to see details.</div>';
      return;
    }

    const note = DashboardHub.buildObsidianNote(event);
    const mapUrl = DashboardHub.mapPageForEvent(event, "..");
    const sourceUrl = event.source_record_url || event.source_url;
    const groupedSources = (event.grouped_sources || []).map((source) => `<li><a href="${DashboardHub.escapeHtml(source.source_record_url || source.source_url || sourceUrl)}" target="_blank" rel="noopener">${DashboardHub.escapeHtml(source.source_name)}</a></li>`).join("");

    els.detailState.innerHTML = `
      <div class="status-row">
        <span class="pill ${DashboardHub.slugify(event.data_mode || "external")}">${DashboardHub.escapeHtml(event.data_mode || "external")}</span>
        <span class="badge">${DashboardHub.escapeHtml(event.source_name)}</span>
        <span class="badge">${DashboardHub.escapeHtml(event.source_id)}</span>
      </div>

      <h3 style="margin-top:14px;">${DashboardHub.escapeHtml(event.title)}</h3>
      <p class="summary">${DashboardHub.escapeHtml(event.summary || "No summary available.")}</p>

      <div class="detail-grid">
        <div class="detail-metric"><span>Start</span><strong>${DashboardHub.escapeHtml(DashboardHub.formatDateTime(event.date_start))}</strong></div>
        <div class="detail-metric"><span>Updated</span><strong>${DashboardHub.escapeHtml(DashboardHub.formatDateTime(event.date_updated))}</strong></div>
        <div class="detail-metric"><span>Location</span><strong>${DashboardHub.escapeHtml(event.latitude !== null && event.longitude !== null ? `${Number(event.latitude).toFixed(5)}, ${Number(event.longitude).toFixed(5)}` : "No coordinates")}</strong></div>
        <div class="detail-metric"><span>Confidence</span><strong>${DashboardHub.escapeHtml(event.confidence || "medium")}</strong></div>
      </div>

      <div class="source-links" style="margin-top:8px;">
        <a class="small-link" href="${DashboardHub.escapeHtml(mapUrl)}">Open on map</a>
        <a class="small-link" href="${DashboardHub.escapeHtml(sourceUrl)}" target="_blank" rel="noopener">Open source</a>
        <button class="small-link" type="button" id="copyNoteButton">Copy Obsidian Event Note</button>
      </div>

      <div class="grid" style="gap:10px; margin-top:14px;">
        <div><strong>Source attribution</strong></div>
        <div class="muted">${DashboardHub.escapeHtml(event.attribution || event.source_name)} · ${DashboardHub.escapeHtml(event.license || "Licence not listed")}</div>
        <div class="muted">Grouped sources: ${DashboardHub.escapeHtml(String(event.grouped_source_count || 1))}</div>
        <ul class="muted" style="padding-left:18px; margin:0;">${groupedSources || "<li>No additional grouped sources.</li>"}</ul>
      </div>

      <div class="field" style="margin-top:14px;">
        <label for="notePreview">Obsidian note preview</label>
        <textarea id="notePreview" readonly></textarea>
      </div>
    `;

    const notePreview = document.getElementById("notePreview");
    if (notePreview) {
      notePreview.value = note;
    }

    const copyNoteButton = document.getElementById("copyNoteButton");
    if (copyNoteButton) {
      copyNoteButton.addEventListener("click", async () => {
        const copied = await DashboardHub.copyText(note);
        copyNoteButton.textContent = copied ? "Copied" : "Copy failed";
        setTimeout(() => {
          copyNoteButton.textContent = "Copy Obsidian Event Note";
        }, 1200);
      });
    }
  }

  function renderTable() {
    const total = state.filteredEvents.length;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    state.page = Math.min(state.page, totalPages - 1);
    const startIndex = state.page * state.pageSize;
    const pageEvents = state.filteredEvents.slice(startIndex, startIndex + state.pageSize);

    els.resultCountText.textContent = `${total} matching events · page ${state.page + 1} of ${totalPages}`;
    els.prevPageButton.disabled = state.page <= 0;
    els.nextPageButton.disabled = state.page >= totalPages - 1;

    if (!state.events.length) {
      setEmptyState("No live records were returned from the current source registry.", "empty");
      return;
    }

    if (!total) {
      setEmptyState("No records match the current filters.", "empty");
      return;
    }

    els.tableState.hidden = true;
    els.tableWrap.hidden = false;
    els.eventTableBody.innerHTML = pageEvents.map((event) => `
      <tr data-event-id="${DashboardHub.escapeHtml(event.event_id)}">
        <td>
          <div>${DashboardHub.escapeHtml(DashboardHub.formatDateTime(event.date_start || event.date_updated))}</div>
          <div class="muted">${DashboardHub.escapeHtml(DashboardHub.formatRelativeTime(event.date_updated || event.date_start))}</div>
        </td>
        <td>
          <strong>${DashboardHub.escapeHtml(event.title)}</strong>
          <div class="muted">${DashboardHub.escapeHtml((event.summary || "").slice(0, 150))}</div>
        </td>
        <td>
          <div>${DashboardHub.escapeHtml(DashboardHub.titleCase(event.event_type))}</div>
          <div class="muted">${DashboardHub.escapeHtml(DashboardHub.titleCase(event.subtype))}</div>
        </td>
        <td>
          <div>${DashboardHub.escapeHtml([event.country, event.region].filter(Boolean).join(" · ") || "No location metadata")}</div>
          <div class="muted">${DashboardHub.escapeHtml(event.latitude !== null && event.longitude !== null ? `${Number(event.latitude).toFixed(3)}, ${Number(event.longitude).toFixed(3)}` : "No coordinates")}</div>
        </td>
        <td><span class="pill ${DashboardHub.slugify(event.severity || "unknown")}">${DashboardHub.escapeHtml(event.severity || "unknown")}</span></td>
        <td><span class="pill ${DashboardHub.slugify(event.status || "unknown")}">${DashboardHub.escapeHtml(event.status || "unknown")}</span></td>
        <td>
          <div>${DashboardHub.escapeHtml(event.source_name)}</div>
          <div class="muted">${DashboardHub.escapeHtml(DashboardHub.sourceStatusLabel({ access_mode: event.data_mode }))}</div>
        </td>
        <td>
          <div class="table-actions">
            <button class="small-link" type="button" data-open-row="${DashboardHub.escapeHtml(event.event_id)}">Open</button>
            <a class="small-link" href="${DashboardHub.escapeHtml(DashboardHub.mapPageForEvent(event, ".."))}">Map</a>
            <a class="small-link" href="${DashboardHub.escapeHtml(event.source_record_url || event.source_url)}" target="_blank" rel="noopener">Source</a>
          </div>
        </td>
      </tr>
    `).join("");

    updateSummaryCounts();

    if (!state.activeEvent || !state.filteredEvents.some((item) => item.event_id === state.activeEvent.event_id)) {
      renderDetail(pageEvents[0]);
    }
  }

  function applyFiltersAndRender() {
    state.filteredEvents = DashboardHub.filterEvents(state.events, state.filters);
    state.page = 0;
    renderTable();
  }

  function buildFilterOptions() {
    const eventTypes = ["all", ...new Set(state.events.map((event) => event.event_type).filter(Boolean))];
    const subtypes = ["all", ...new Set(state.events.map((event) => event.subtype).filter(Boolean))];
    const sourceIds = ["all", ...state.registry.map((source) => source.id)];
    const severities = ["all", ...new Set(state.events.map((event) => event.severity).filter(Boolean))];
    const statuses = ["all", ...new Set(state.events.map((event) => event.status).filter(Boolean))];
    const modes = ["all", ...new Set(state.events.map((event) => event.data_mode).filter(Boolean))];

    populateSelect(els.eventTypeSelect, eventTypes.map((value) => ({ value, label: value === "all" ? "All types" : DashboardHub.titleCase(value) })), state.filters.event_type);
    populateSelect(els.subtypeSelect, subtypes.map((value) => ({ value, label: value === "all" ? "All subtypes" : DashboardHub.titleCase(value) })), state.filters.subtype);
    populateSelect(els.sourceSelect, sourceIds.map((value) => ({ value, label: value === "all" ? "All sources" : (state.registry.find((source) => source.id === value)?.name || value) })), state.filters.source_id);
    populateSelect(els.severitySelect, severities.map((value) => ({ value, label: value === "all" ? "All severities" : DashboardHub.titleCase(value) })), state.filters.severity);
    populateSelect(els.statusSelect, statuses.map((value) => ({ value, label: value === "all" ? "All statuses" : DashboardHub.titleCase(value) })), state.filters.status);
    populateSelect(els.modeSelect, modes.map((value) => ({ value, label: value === "all" ? "All modes" : DashboardHub.titleCase(value) })), state.filters.data_mode);
    populateSelect(els.timeRangeSelect, [
      { value: "all", label: "All available" },
      { value: "24h", label: "Last 24 hours" },
      { value: "7d", label: "Last 7 days" },
      { value: "30d", label: "Last 30 days" }
    ], state.filters.time_range);
  }

  function bindFilterListeners() {
    els.searchInput.addEventListener("input", () => {
      state.filters.search = els.searchInput.value;
      applyFiltersAndRender();
    });

    [
      [els.eventTypeSelect, "event_type"],
      [els.subtypeSelect, "subtype"],
      [els.sourceSelect, "source_id"],
      [els.severitySelect, "severity"],
      [els.statusSelect, "status"],
      [els.modeSelect, "data_mode"],
      [els.timeRangeSelect, "time_range"]
    ].forEach(([element, key]) => {
      element.addEventListener("change", () => {
        state.filters[key] = element.value;
        applyFiltersAndRender();
      });
    });

    [
      [els.onlyActiveCheckbox, "onlyActive"],
      [els.onlyMajorCheckbox, "onlyMajor"],
      [els.onlyCoordsCheckbox, "requireCoords"]
    ].forEach(([element, key]) => {
      element.addEventListener("change", () => {
        state.filters[key] = element.checked;
        applyFiltersAndRender();
      });
    });

    els.refreshButton.addEventListener("click", () => loadDashboard(true));
    els.resetButton.addEventListener("click", () => {
      state.filters = {
        search: "",
        event_type: "all",
        subtype: "all",
        source_id: "all",
        severity: "all",
        status: "all",
        data_mode: "all",
        time_range: "all",
        onlyActive: false,
        onlyMajor: false,
        requireCoords: false
      };

      els.searchInput.value = "";
      els.onlyActiveCheckbox.checked = false;
      els.onlyMajorCheckbox.checked = false;
      els.onlyCoordsCheckbox.checked = false;
      buildFilterOptions();
      applyFiltersAndRender();
    });

    els.prevPageButton.addEventListener("click", () => {
      if (state.page > 0) {
        state.page -= 1;
        renderTable();
      }
    });

    els.nextPageButton.addEventListener("click", () => {
      const totalPages = Math.max(1, Math.ceil(state.filteredEvents.length / state.pageSize));
      if (state.page < totalPages - 1) {
        state.page += 1;
        renderTable();
      }
    });

    els.eventTableBody.addEventListener("click", (event) => {
      const button = event.target.closest("[data-open-row]");
      if (!button) return;
      const eventId = button.getAttribute("data-open-row");
      const chosen = state.filteredEvents.find((item) => item.event_id === eventId);
      if (chosen) renderDetail(chosen);
    });
  }

  async function loadDashboard(forceReload = false) {
    if (state.loading) return;
    state.loading = true;
    els.tableState.hidden = false;
    els.tableWrap.hidden = true;
    els.tableState.className = "loading";
    els.tableState.textContent = forceReload ? "Refreshing live sources…" : "Loading source registry and live events…";

    try {
      const registry = await DashboardHub.loadRegistry("../config/data-sources.json");
      state.registry = registry;

      const url = new URL(window.location.href);
      const eventType = url.searchParams.get("type") || "all";
      const sourceIds = url.searchParams.get("source");

      if (eventType) {
        state.filters.event_type = eventType;
      }

      const catalog = await DashboardHub.loadEventCatalog({
        registry,
        sourceIds: sourceIds ? sourceIds.split(",").map((value) => value.trim()).filter(Boolean) : null,
        configUrl: "../config/data-sources.json"
      });

      state.sources = catalog.sources;
      state.events = catalog.events || [];
      updateSourceRegistryPanel();
      buildFilterOptions();
      applyFiltersAndRender();

      if (!state.events.length) {
        setEmptyState("No live event records were returned by the configured sources.", "empty");
      }
    } catch (error) {
      console.error(error);
      setEmptyState("The Event Explorer could not load the registry or live feeds right now.", "error");
      els.sourceStatusText.textContent = "Source registry load failed.";
      els.sourceStatusList.innerHTML = `<div class="error">${DashboardHub.escapeHtml(error.message || String(error))}</div>`;
    } finally {
      state.loading = false;
    }
  }

  function init() {
    bindElements();
    bindFilterListeners();
    loadDashboard(false);
  }

  document.addEventListener("DOMContentLoaded", init);
})();