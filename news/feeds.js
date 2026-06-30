(function () {
  const FEED_SOURCES = [
    {
      title: "WILD HOMESTEAD",
      url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCstLIadsuuLmDdIzMZxesfg",
      category: "Videos/Enjoyment",
      kind: "Video",
    },
    {
      title: "DW Documentary",
      url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCW39zufHfsuGgpLviKh297Q",
      category: "Videos/Learning",
      kind: "Video",
    },
    {
      title: "PBS Terra",
      url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCpxYSWgxVt3Pyn1ovXsGQ0g",
      category: "Videos/Learning",
      kind: "Video",
    },
    {
      title: "Max Fisher",
      url: "https://rss.app/feeds/OHpTHnmmcQbi7lWw.xml",
      category: "Videos/Learning",
      kind: "Video",
    },
    {
      title: "Astrum Earth",
      url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCWBtLCE-BnzZx3DneqDiXWQ",
      category: "Videos/Learning",
      kind: "Video",
    },
    {
      title: "The Climate Question",
      url: "https://podcasts.files.bbci.co.uk/w13xtvb6.rss",
      category: "Podcasts",
      kind: "Podcast",
    },
    {
      title: "Science Weekly | The Guardian",
      url: "https://www.theguardian.com/science/series/science/rss",
      category: "Podcasts",
      kind: "Podcast",
    },
    {
      title: "Carbon Brief",
      url: "https://www.carbonbrief.org/feed",
      category: "RSS/Science and Climate",
      kind: "Article",
    },
    {
      title: "Eos",
      url: "https://eos.org/feed",
      category: "RSS/Science and Climate",
      kind: "Article",
    },
    {
      title: "Copernicus",
      url: "https://climate.copernicus.eu/rss.xml",
      category: "RSS/Science and Climate",
      kind: "Article",
    },
    {
      title: "Science | The Guardian",
      url: "https://www.theguardian.com/science/rss",
      category: "RSS/Science and Climate",
      kind: "Article",
    },
    {
      title: "BBC News",
      url: "http://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
      category: "RSS/Science and Climate",
      kind: "Article",
    },
    {
      title: "Nisa Blog - All Things Environmental Sustainability",
      url: "https://feedfry.com/rss/11f1556cf7007b79a9e4704a92375605",
      category: "RSS/Science and Climate",
      kind: "Article",
    },
    {
      title: "FA RSS",
      url: "https://www.foreignaffairs.com/rss.xml",
      category: "RSS/Geopolitics",
      kind: "Article",
    },
    {
      title: "International Crisis Group",
      url: "https://www.crisisgroup.org/rss.xml",
      category: "RSS/Geopolitics",
      kind: "Article",
    },
  ];

  const CACHE_KEY = "dashboard-hub-news-cache-v1";
  const CACHE_TTL_MS = 30 * 60 * 1000;

  function slugify(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase();
  }

  function stripHtml(value) {
    return String(value || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function shorten(value, maxLength) {
    const cleaned = stripHtml(value);
    if (cleaned.length <= maxLength) return cleaned;
    return cleaned.slice(0, maxLength - 3).trimEnd() + "...";
  }

  function parseDate(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  function articlePath(category, title, publishedAt) {
    const datePart = publishedAt ? publishedAt.slice(0, 10) : "undated";
    return "articles/" + slugify(category) + "/" + slugify(datePart + " " + title) + ".md";
  }

  function sourcePath(feedTitle) {
    return "sources/" + feedTitle.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() + ".md";
  }

  async function fetchJsonFeed(feed, limitPerFeed) {
    const endpoint = "https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(feed.url) + "&count=" + encodeURIComponent(String(limitPerFeed));
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("rss2json returned " + response.status);
    }

    const payload = await response.json();
    if (payload.status && payload.status !== "ok") {
      throw new Error(payload.message || "rss2json could not parse the feed");
    }

    const feedTitle = payload.feed && payload.feed.title ? payload.feed.title : feed.title;
    const items = Array.isArray(payload.items) ? payload.items : [];

    return items.map(function (item) {
      const publishedAt = parseDate(item.pubDate || item.published || item.updated);
      return {
        id: item.guid || item.link || [feedTitle, item.title, publishedAt].join("|"),
        title: item.title || "Untitled item",
        link: item.link || "",
        published_at: publishedAt,
        author: item.author || feedTitle,
        summary: shorten(item.description || item.content || "", 220),
        content: stripHtml(item.content || item.description || ""),
        feed_title: feedTitle,
        feed_url: feed.url,
        feed_label: feed.title,
        category: feed.category,
        kind: feed.kind,
        source_path: sourcePath(feedTitle),
        article_path: articlePath(feed.category, item.title || "Untitled item", publishedAt),
      };
    }).filter(function (item) {
      return item.link;
    });
  }

  function parseXmlItems(feed, xmlText, limitPerFeed) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "text/xml");
    if (xml.querySelector("parsererror")) {
      throw new Error("Could not parse XML");
    }

    const atomEntries = Array.from(xml.querySelectorAll("feed > entry"));
    const rssEntries = Array.from(xml.querySelectorAll("channel > item"));
    const entries = (atomEntries.length ? atomEntries : rssEntries).slice(0, limitPerFeed);

    return entries.map(function (entry) {
      const titleNode = entry.querySelector("title");
      const linkNode = entry.querySelector("link");
      const summaryNode = entry.querySelector("summary, description");
      const contentNode = entry.querySelector("content");
      const authorNode = entry.querySelector("author > name, author");
      const publishedNode = entry.querySelector("published, updated, pubDate");

      const rawLink = linkNode ? (linkNode.getAttribute("href") || linkNode.textContent || "") : "";
      const publishedAt = parseDate(publishedNode ? publishedNode.textContent : "");
      const feedTitleNode = xml.querySelector("feed > title, channel > title");
      const resolvedFeedTitle = feedTitleNode ? feedTitleNode.textContent.trim() : feed.title;
      const title = titleNode ? titleNode.textContent.trim() : "Untitled item";
      const summary = summaryNode ? summaryNode.textContent : "";
      const content = contentNode ? contentNode.textContent : summary;

      return {
        id: rawLink || [resolvedFeedTitle, title, publishedAt].join("|"),
        title: title,
        link: rawLink.trim(),
        published_at: publishedAt,
        author: authorNode ? authorNode.textContent.trim() : resolvedFeedTitle,
        summary: shorten(summary || content, 220),
        content: stripHtml(content || summary),
        feed_title: resolvedFeedTitle,
        feed_url: feed.url,
        feed_label: feed.title,
        category: feed.category,
        kind: feed.kind,
        source_path: sourcePath(resolvedFeedTitle),
        article_path: articlePath(feed.category, title, publishedAt),
      };
    }).filter(function (item) {
      return item.link;
    });
  }

  async function fetchXmlFeed(feed, limitPerFeed) {
    const endpoint = "https://api.allorigins.win/raw?url=" + encodeURIComponent(feed.url);
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("AllOrigins returned " + response.status);
    }
    const xmlText = await response.text();
    return parseXmlItems(feed, xmlText, limitPerFeed);
  }

  async function loadFeedItems(feed, limitPerFeed) {
    try {
      return await fetchJsonFeed(feed, limitPerFeed);
    } catch (jsonError) {
      try {
        return await fetchXmlFeed(feed, limitPerFeed);
      } catch (xmlError) {
        return [];
      }
    }
  }

  function groupSections(items) {
    const map = new Map();
    items.forEach(function (item) {
      if (!map.has(item.category)) {
        map.set(item.category, []);
      }
      map.get(item.category).push(item);
    });

    return Array.from(map.entries()).map(function (entry) {
      return {
        category: entry[0],
        item_count: entry[1].length,
        items: entry[1],
      };
    });
  }

  function createFeedMeta(feed, items) {
    const latest = items[0];
    return {
      title: latest && latest.feed_title ? latest.feed_title : feed.title,
      label: feed.title,
      url: feed.url,
      category: feed.category,
      kind: feed.kind,
      item_count: items.length,
      latest_published: latest && latest.published_at ? latest.published_at : "",
      source_path: sourcePath(latest && latest.feed_title ? latest.feed_title : feed.title),
    };
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (!payload || !payload.saved_at || !payload.data) return null;
      if (Date.now() - payload.saved_at > CACHE_TTL_MS) return null;
      return payload.data;
    } catch (error) {
      return null;
    }
  }

  function writeCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        saved_at: Date.now(),
        data: data,
      }));
    } catch (error) {
      return;
    }
  }

  async function loadFeedBundle(options) {
    const config = Object.assign({
      limitPerFeed: 6,
      maxItems: 60,
      forceRefresh: false,
    }, options || {});

    if (!config.forceRefresh) {
      const cached = readCache();
      if (cached) return cached;
    }

    const perFeedResults = await Promise.all(FEED_SOURCES.map(async function (feed) {
      const items = await loadFeedItems(feed, config.limitPerFeed);
      return {
        meta: createFeedMeta(feed, items),
        items: items,
      };
    }));

    const items = perFeedResults
      .flatMap(function (result) { return result.items; })
      .sort(function (left, right) {
        return (right.published_at || "").localeCompare(left.published_at || "");
      })
      .slice(0, config.maxItems);

    const data = {
      generated_at: new Date().toISOString(),
      feed_count: FEED_SOURCES.length,
      item_count: items.length,
      feeds: perFeedResults.map(function (result) { return result.meta; }),
      sections: groupSections(items),
      items: items,
    };

    writeCache(data);
    return data;
  }

  window.DashboardNews = {
    FEED_SOURCES: FEED_SOURCES,
    loadFeedBundle: loadFeedBundle,
  };
})();
