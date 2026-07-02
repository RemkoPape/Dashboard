(function () {
  function parseList(value) {
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function sourceCard(source, eventCount) {
    const mode = DashboardHub.slugify(DashboardHub.sourceStatusLabel(source));
    return `
      <article class="card">
        <div class="status-row">
          <span class="pill ${mode}">${DashboardHub.escapeHtml(DashboardHub.sourceStatusLabel(source))}</span>
          <span class="badge">${DashboardHub.escapeHtml(source.category || "source")}</span>
          <span class="badge">${DashboardHub.escapeHtml(source.subtype || source.event_type || "")}</span>
        </div>
        <h3 style="margin-top:12px;">${DashboardHub.escapeHtml(source.name)}</h3>
        <p style="margin-top:8px;">${DashboardHub.escapeHtml(source.attribution || source.license || source.documentation_url || source.url)}</p>
        <p style="margin-top:8px;">Refresh every ${DashboardHub.escapeHtml(String(source.refresh_interval_minutes || "?"))} minutes · ${DashboardHub.escapeHtml(String(eventCount || 0))} live event(s)</p>
        <div class="source-links" style="margin-top:10px;">
          <a class="small-link" href="${DashboardHub.escapeHtml(source.documentation_url || source.url)}" target="_blank" rel="noopener">Docs</a>
          <a class="small-link" href="${DashboardHub.escapeHtml(source.url)}" target="_blank" rel="noopener">Endpoint</a>
        </div>
      </article>
    `;
  }

  function eventCard(event, basePath) {
    return `
      <article class="card">
        <div class="status-row">
          <span class="pill ${DashboardHub.slugify(event.data_mode || "external")}">${DashboardHub.escapeHtml(event.data_mode || "external")}</span>
          <span class="badge">${DashboardHub.escapeHtml(event.subtype)}</span>
          <span class="badge">${DashboardHub.escapeHtml(event.severity || "unknown")}</span>
        </div>
        <h3 style="margin-top:12px;">${DashboardHub.escapeHtml(event.title)}</h3>
        <p style="margin-top:8px;">${DashboardHub.escapeHtml(event.summary || "No summary available.")}</p>
        <div class="source-links" style="margin-top:10px;">
          <a class="small-link" href="${DashboardHub.escapeHtml(DashboardHub.mapPageForEvent(event, basePath))}">Open map</a>
          <a class="small-link" href="${DashboardHub.escapeHtml(event.source_record_url || event.source_url)}" target="_blank" rel="noopener">Source</a>
          <a class="small-link" href="../events/?type=${DashboardHub.escapeHtml(event.event_type)}">Explorer</a>
        </div>
      </article>
    `;
  }

  async function init() {
    const body = document.body;
    const title = body.dataset.pageTitle || document.title;
    const summary = body.dataset.pageSummary || "";
    const registryUrl = body.dataset.registryUrl || "../config/data-sources.json";
    const categories = parseList(body.dataset.categories);
    const eventTypes = parseList(body.dataset.eventTypes);
    const sourceIds = parseList(body.dataset.sourceIds);
    const explorerQuery = body.dataset.explorerQuery || "";
    const basePath = body.dataset.basePath || "..";
    const sourceListEl = document.getElementById("monitorSources");
    const eventListEl = document.getElementById("monitorEvents");
    const sourceCountEl = document.getElementById("monitorSourceCount");
    const eventCountEl = document.getElementById("monitorEventCount");
    const lastUpdateEl = document.getElementById("monitorLastUpdate");
    const explorerLinkEl = document.getElementById("monitorExplorerLink");
    const statusTextEl = document.getElementById("monitorStatusText");
    const titleEl = document.getElementById("monitorTitle");
    const summaryEl = document.getElementById("monitorSummary");

    if (titleEl) titleEl.textContent = title;
    if (summaryEl) summaryEl.textContent = summary;
    if (explorerLinkEl) explorerLinkEl.href = `../events/${explorerQuery}`;

    try {
      const registry = await DashboardHub.loadRegistry(registryUrl);
      const selectedSources = registry.filter((source) => {
        if (sourceIds.length && !sourceIds.includes(source.id)) return false;
        if (categories.length && !categories.includes(source.category)) return false;
        if (eventTypes.length && !eventTypes.includes(source.event_type)) return false;
        return true;
      });

      const catalog = await DashboardHub.loadEventCatalog({
        registry,
        sourceIds: selectedSources.map((source) => source.id),
        configUrl: registryUrl
      });

      const sourceById = new Map(catalog.sources.map((entry) => [entry.source.id, entry]));
      const activeEvents = catalog.events || [];

      if (sourceCountEl) sourceCountEl.textContent = String(selectedSources.length);
      if (eventCountEl) eventCountEl.textContent = String(activeEvents.length);
      if (lastUpdateEl) lastUpdateEl.textContent = activeEvents.length ? DashboardHub.formatDateTime(activeEvents[0].date_updated || activeEvents[0].date_start) : "No live data";
      if (statusTextEl) {
        statusTextEl.textContent = `${selectedSources.length} sources selected · ${activeEvents.length} live records surfaced`;
      }

      if (sourceListEl) {
        sourceListEl.innerHTML = selectedSources.length
          ? selectedSources.map((source) => sourceCard(source, (sourceById.get(source.id)?.events || []).length)).join("")
          : '<div class="empty">No sources matched the current page configuration.</div>';
      }

      if (eventListEl) {
        eventListEl.innerHTML = activeEvents.length
          ? activeEvents.slice(0, 6).map((event) => eventCard(event, basePath)).join("")
          : '<div class="empty">No live records matched the current selection yet.</div>';
      }
    } catch (error) {
      console.error(error);
      if (statusTextEl) statusTextEl.textContent = "This monitor could not load live source data right now.";
      if (sourceListEl) sourceListEl.innerHTML = `<div class="error">${DashboardHub.escapeHtml(error.message || String(error))}</div>`;
      if (eventListEl) eventListEl.innerHTML = '<div class="empty">Live records will appear once the source requests succeed.</div>';
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();