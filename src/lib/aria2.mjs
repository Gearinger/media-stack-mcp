/** aria2 JSON-RPC client (works with a bundled aria2c or an external one such as Motrix). */

export async function rpc(cfg, method, params = [], timeout = 30000) {
  const full = cfg.aria2.secret ? [`token:${cfg.aria2.secret}`, ...params] : params;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let payload;
  try {
    const res = await fetch(cfg.aria2.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "media-stack", method, params: full }),
      signal: ctrl.signal,
    });
    payload = await res.json();
  } catch (err) {
    throw new Error(
      `无法连接 aria2 (${cfg.aria2.rpcUrl})：${err.message}。确认 aria2 或 Motrix 正在运行。`,
    );
  } finally {
    clearTimeout(timer);
  }
  if (payload.error) throw new Error(`aria2 ${method}: ${payload.error.message}`);
  return payload.result;
}

export const version = (cfg) => rpc(cfg, "aria2.getVersion", [], 10000);
export const globalStat = (cfg) => rpc(cfg, "aria2.getGlobalStat", [], 10000);
export const tellActive = (cfg) => rpc(cfg, "aria2.tellActive");
export const tellWaiting = (cfg, limit = 20) => rpc(cfg, "aria2.tellWaiting", [0, limit]);
export const tellStopped = (cfg, limit = 20) => rpc(cfg, "aria2.tellStopped", [0, limit]);

export function addUri(cfg, uri, options = {}) {
  return rpc(cfg, "aria2.addUri", [[uri], options], 60000);
}

export async function addTorrentFile(cfg, url, options = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`取种子失败 HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 20) throw new Error("取到的种子文件内容异常");
  return rpc(cfg, "aria2.addTorrent", [buf.toString("base64"), [], options], 60000);
}

const ACTIONS = {
  pause: "aria2.pause",
  resume: "aria2.unpause",
  remove: "aria2.remove",
  purge: "aria2.removeDownloadResult",
};

export function control(cfg, action, gid) {
  const method = ACTIONS[action];
  if (!method) throw new Error(`未知操作 ${action}`);
  return rpc(cfg, method, [gid]);
}
