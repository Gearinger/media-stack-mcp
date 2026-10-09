#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../lib/config.mjs";
import { Stack } from "../lib/ops.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "public");
const cfg = loadConfig();
const stack = new Stack(cfg);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("请求体不是合法 JSON");
  }
}

async function serveStatic(res, pathname) {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const target = resolve(PUBLIC, normalize(rel));
  if (!target.startsWith(PUBLIC + sep)) return send(res, 403, { error: "forbidden" });
  try {
    const file = await readFile(target);
    send(res, 200, file, MIME[extname(target)] || "application/octet-stream");
  } catch {
    send(res, 404, { error: "not found" });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const { pathname, searchParams } = url;
  try {
    if (pathname === "/api/status") {
      const s = await stack.status();
      return send(res, 200, {
        ...s,
        downloadDir: cfg.aria2.downloadDir || null,
        prowlarrUrl: cfg.prowlarr.url,
        aria2Url: cfg.aria2.rpcUrl,
      });
    }
    if (pathname === "/api/search") {
      const q = (searchParams.get("q") || "").trim();
      if (!q) return send(res, 400, { error: "缺少 q 参数" });
      const indexers = searchParams.get("indexers");
      const out = await stack.search(q, {
        limit: Number(searchParams.get("limit")) || undefined,
        indexers: indexers ? indexers.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      });
      return send(res, 200, out);
    }
    if (pathname === "/api/download" && req.method === "POST") {
      const body = await readBody(req);
      const out = await stack.download(body);
      return send(res, 200, out);
    }
    if (pathname === "/api/downloads") {
      const groups = await stack.downloads(searchParams.get("status") || "all", Number(searchParams.get("limit")) || 20);
      return send(res, 200, { groups });
    }
    if (pathname === "/api/control" && req.method === "POST") {
      const { action, gid } = await readBody(req);
      await stack.control(action, gid);
      return send(res, 200, { ok: true });
    }
    if (pathname === "/api/indexers") {
      if (searchParams.get("test")) {
        return send(res, 200, { text: await stack.indexersText(true) });
      }
      const list = await stack.indexers();
      return send(res, 200, {
        indexers: list.map((i) => ({ id: i.id, name: i.name, enable: i.enable, protocol: i.protocol })),
      });
    }
    return serveStatic(res, pathname);
  } catch (err) {
    return send(res, 502, { error: String((err && err.message) || err) });
  }
});

server.listen(cfg.web.port, cfg.web.host, () => {
  const shown = cfg.web.host === "0.0.0.0" ? "localhost" : cfg.web.host;
  console.log(`[media-stack] web UI → http://${shown}:${cfg.web.port}`);
  console.log(`[media-stack] Prowlarr ${cfg.prowlarr.url} | aria2 ${cfg.aria2.rpcUrl}`);
});
