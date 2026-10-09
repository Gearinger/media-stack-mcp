#!/usr/bin/env node
/**
 * stdio MCP server. Zero dependencies: raw JSON-RPC 2.0 over stdin/stdout.
 * Nothing except protocol messages may ever be written to stdout.
 */
import { loadConfig } from "./lib/config.mjs";
import { Stack } from "./lib/ops.mjs";

const SERVER = { name: "media-stack", version: "0.1.0" };
const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const stack = new Stack(loadConfig());

const TOOLS = [
  {
    name: "search",
    description:
      "Search torrent indexers through the local Prowlarr instance. Returns a numbered, ranked " +
      "list (title, indexer, size, seeders). Download one of them with `download` + pick=<number>; " +
      "do not copy links out of the results. Aggregated search can take 30-90s because slow " +
      "indexers must time out — prefer running it in a background thread.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search terms, e.g. title plus year or quality" },
        limit: { type: "integer", description: "Max results to return (default 10)" },
        indexers: { type: "array", items: { type: "string" }, description: "Restrict to these indexer names" },
        timeout_sec: { type: "integer", description: "Search timeout in seconds (default 120)" },
      },
      required: ["query"],
    },
  },
  {
    name: "download",
    description:
      "Queue something in aria2 (built-in downloader, or Motrix if configured). Pass `pick` (a " +
      "number from the last search) or an explicit `url` (magnet / http). Returns a gid for `downloads`.",
    inputSchema: {
      type: "object",
      properties: {
        pick: { type: "integer", description: "1-based number from the most recent search" },
        url: { type: "string", description: "magnet: URI or http(s) URL" },
        dir: { type: "string", description: "Absolute download directory override" },
      },
    },
  },
  {
    name: "downloads",
    description: "List downloads with progress, speed and ETA.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["active", "waiting", "stopped", "all"], description: "Default all" },
        limit: { type: "integer", description: "Max entries (default 20)" },
      },
    },
  },
  {
    name: "download_control",
    description: "Pause, resume, remove or purge a download by gid.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["pause", "resume", "remove", "purge"] },
        gid: { type: "string" },
      },
      required: ["action", "gid"],
    },
  },
  {
    name: "indexers",
    description: "List configured Prowlarr indexers, optionally testing each one for connectivity.",
    inputSchema: {
      type: "object",
      properties: { test: { type: "boolean", description: "Test every indexer (slow)" } },
    },
  },
  {
    name: "stack_status",
    description: "Health check for Prowlarr and aria2, plus the configured download directory.",
    inputSchema: { type: "object", properties: {} },
  },
];

const HANDLERS = {
  async search(args) {
    const r = await stack.search(args.query, {
      limit: Number(args.limit) || undefined,
      indexers: args.indexers,
      timeoutMs: args.timeout_sec ? Number(args.timeout_sec) * 1000 : undefined,
    });
    if (!r.results.length) {
      return `"${r.query}"：${(r.tookMs / 1000) | 0}s，${r.total} 条原始结果但没有可用下载链接。换个关键词，或用 indexers 工具确认哪些源可用。`;
    }
    const body = r.results
      .map((v) => {
        const lines = [
          `#${v.pick} ${v.title}`,
          `    来源=${v.indexer} 大小=${v.size ? (v.size / 1024 ** 2).toFixed(1) + "M" : "?"} 做种=${v.seeders ?? "?"} 下载=${v.leechers ?? "?"} 分类=${v.category || "-"}`,
        ];
        if (v.magnet) lines.push(`    magnet: ${v.magnet}`);
        return lines.join("\n");
      })
      .join("\n");
    return (
      `"${r.query}"：${(r.tookMs / 1000) | 0}s 内 ${r.total} 条结果，${r.usable} 条可用，列出前 ${r.results.length} 条：\n` +
      body +
      `\n\n下载用 download 的 pick=<编号>。编号只在本次搜索缓存里有效，重新搜索会覆盖。`
    );
  },
  async download(args) {
    const out = await stack.download(args);
    return `已提交到 aria2。\n任务: ${out.title}\ngid: ${out.gid}\n下载目录: ${out.dir}\n用 downloads 工具查看进度。`;
  },
  downloads: (args) => stack.downloadsText(args.status || "all", Number(args.limit) || 20),
  async download_control(args) {
    const out = await stack.control(args.action, args.gid);
    return `${args.action} ${args.gid} → ${JSON.stringify(out)}`;
  },
  indexers: (args) => stack.indexersText(!!args.test),
  async stack_status() {
    return (await stack.status()).text;
  },
};

function write(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined || id === null) return;
  try {
    if (method === "initialize") {
      const asked = params && params.protocolVersion;
      write({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER,
        },
      });
      return;
    }
    if (method === "ping") return write({ jsonrpc: "2.0", id, result: {} });
    if (method === "tools/list") return write({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    if (method === "tools/call") {
      const handler = HANDLERS[params && params.name];
      if (!handler) throw new Error(`未知工具 ${params && params.name}`);
      try {
        const text = await handler(params.arguments || {});
        write({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }] } });
      } catch (err) {
        write({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: `错误: ${err.message || err}` }], isError: true },
        });
      }
      return;
    }
    write({ jsonrpc: "2.0", id, error: { code: -32601, message: `未知方法 ${method}` } });
  } catch (err) {
    write({ jsonrpc: "2.0", id, error: { code: -32603, message: String(err.message || err) } });
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    handle(msg).catch((err) => process.stderr.write(`[media-stack] ${err}\n`));
  }
});
process.stdin.on("end", () => process.exit(0));
process.stderr.write(`[media-stack] MCP server ready (${stack.cfg.prowlarr.url})\n`);
