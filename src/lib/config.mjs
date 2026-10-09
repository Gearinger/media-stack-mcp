import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = resolve(HERE, "../../config.json");

/**
 * Precedence: environment variables > config.json > built-in defaults.
 * Environment variables win so the same image works in Docker without a file.
 */
export function loadConfig() {
  const path = process.env.MEDIA_STACK_CONFIG || DEFAULT_PATH;
  let file = {};
  try {
    file = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const p = file.prowlarr || {};
  const a = file.aria2 || {};
  return {
    path,
    prowlarr: {
      url: (process.env.PROWLARR_URL || p.url || "http://127.0.0.1:9696").replace(/\/$/, ""),
      apiKey: process.env.PROWLARR_API_KEY || p.api_key || "",
    },
    aria2: {
      rpcUrl: process.env.ARIA2_RPC_URL || a.rpc_url || "http://127.0.0.1:6800/jsonrpc",
      secret: process.env.ARIA2_SECRET ?? a.secret ?? "",
      downloadDir: process.env.DOWNLOAD_DIR || a.download_dir || "",
    },
    web: {
      port: Number(process.env.PORT || (file.web && file.web.port) || 8787),
      host: process.env.HOST || (file.web && file.web.host) || "127.0.0.1",
    },
    search: {
      defaultLimit: Number((file.search && file.search.default_limit) || 10),
      timeoutMs: Number(process.env.SEARCH_TIMEOUT_MS || 120000),
    },
  };
}
