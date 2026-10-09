#!/usr/bin/env node
// Tiny MCP client for manual testing:
//   node scripts/call.mjs search '{"query":"big buck bunny"}' download '{"pick":1}' downloads '{}'
import { spawn } from "node:child_process";

const rest = process.argv.slice(2);
const calls = [];
for (let i = 0; i < rest.length; i += 2) {
  calls.push({ tool: rest[i], args: rest[i + 1] ? JSON.parse(rest[i + 1]) : {} });
}
if (!calls.length) {
  console.error("usage: mcp-call.mjs <tool> '<json>' [<tool> '<json>' ...]");
  process.exit(2);
}
const server = spawn(process.execPath, [new URL("../src/mcp.mjs", import.meta.url).pathname], {
  stdio: ["pipe", "pipe", "inherit"],
});

let buf = "";
let nextId = 1;
const pending = new Map();

server.stdout.setEncoding("utf8");
server.stdout.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    const resolve = pending.get(msg.id);
    if (resolve) {
      pending.delete(msg.id);
      resolve(msg);
    }
  }
});

function send(method, params) {
  const id = nextId++;
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return new Promise((resolve) => pending.set(id, resolve));
}

const t0 = Date.now();
await send("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "mcp-call", version: "1" },
});
server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

for (const call of calls) {
  const started = Date.now();
  const res = await send("tools/call", { name: call.tool, arguments: call.args });
  console.log(`=== ${call.tool} ===`);
  if (res.error) {
    console.log("RPC ERROR:", JSON.stringify(res.error));
  } else {
    const block = (res.result.content || []).map((c) => c.text).join("\n");
    console.log(block);
    if (res.result.isError) console.log("[tool returned isError=true]");
  }
  console.log(`(${((Date.now() - started) / 1000).toFixed(1)}s)\n`);
}
console.log(`total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
server.kill();
process.exit(0);
