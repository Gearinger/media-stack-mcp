/** Thin wrapper around the Prowlarr v1 API. */

async function request(cfg, path, { method = "GET", body, timeout = 30000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${cfg.prowlarr.url}/api/v1${path}`, {
      method,
      headers: {
        "X-Api-Key": cfg.prowlarr.apiKey,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Prowlarr HTTP ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timer);
  }
}

export const systemStatus = (cfg, timeout = 15000) => request(cfg, "/system/status", { timeout });
export const listIndexers = (cfg, timeout = 30000) => request(cfg, "/indexer", { timeout });

export function testIndexer(cfg, id, timeout = 90000) {
  return request(cfg, `/indexer/test?indexerId=${id}`, { method: "POST", body: {}, timeout });
}

export function indexerSchema(cfg) {
  return request(cfg, "/indexer/schema", { timeout: 60000 });
}

export function addIndexer(cfg, definition) {
  return request(cfg, "/indexer", { method: "POST", body: definition, timeout: 180000 });
}

export async function search(cfg, query, { limit = 100, indexers, timeoutMs } = {}) {
  const params = new URLSearchParams({ query, type: "search", limit: String(limit) });
  if (indexers && indexers.length) params.set("indexers", indexers.join(","));
  const results = (await request(cfg, `/search?${params}`, {
    timeout: timeoutMs || cfg.search.timeoutMs,
  })) || [];
  results.sort((a, b) => (b.seeders ?? -1) - (a.seeders ?? -1));
  return results;
}

const TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.demonii.com:1337/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://exodus.desync.com:6969/announce",
];

/** Prowlarr returns magnets, info hashes, plain torrent proxies — normalise to one link. */
export function magnetFor(result) {
  if (result.magnetUrl) return result.magnetUrl;
  const guid = String(result.guid || "");
  if (guid.startsWith("magnet:")) return guid;
  if (result.infoHash) {
    const tr = TRACKERS.map((t) => `&tr=${encodeURIComponent(t)}`).join("");
    return `magnet:?xt=urn:btih:${result.infoHash}&dn=${encodeURIComponent(result.title || "")}${tr}`;
  }
  return null;
}

export const shortMagnet = (result) => {
  const m = magnetFor(result);
  return m && m.length <= 400 ? m : null;
};

export function resultView(r, index) {
  return {
    pick: index,
    title: r.title,
    indexer: r.indexer,
    size: r.size || 0,
    seeders: r.seeders ?? null,
    leechers: r.leechers ?? null,
    category: (r.categories || []).map((c) => c.name).join("/"),
    magnet: shortMagnet(r),
    publishDate: r.publishDate || null,
  };
}
