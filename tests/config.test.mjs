import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/lib/config.mjs";

function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("environment variables override config.json", () => {
  const dir = mkdtempSync(join(tmpdir(), "media-stack-"));
  const path = join(dir, "config.json");
  writeFileSync(
    path,
    JSON.stringify({
      prowlarr: { url: "http://file:9696", api_key: "file-key" },
      aria2: { rpc_url: "http://file:6800/jsonrpc", secret: "file-secret", download_dir: "/file" },
      web: { port: 9999 },
    }),
  );
  withEnv(
    {
      MEDIA_STACK_CONFIG: path,
      PROWLARR_URL: "http://env:9696",
      PROWLARR_API_KEY: "env-key",
      ARIA2_SECRET: "env-secret",
      DOWNLOAD_DIR: "/env",
      PORT: "1234",
      ARIA2_RPC_URL: undefined,
    },
    () => {
      const cfg = loadConfig();
      assert.equal(cfg.prowlarr.url, "http://env:9696");
      assert.equal(cfg.prowlarr.apiKey, "env-key");
      assert.equal(cfg.aria2.secret, "env-secret");
      assert.equal(cfg.aria2.downloadDir, "/env");
      assert.equal(cfg.web.port, 1234);
      assert.equal(cfg.aria2.rpcUrl, "http://file:6800/jsonrpc");
    },
  );
});

test("falls back to defaults when nothing is configured", () => {
  withEnv(
    { MEDIA_STACK_CONFIG: "/nonexistent/config.json", PROWLARR_URL: undefined, PROWLARR_API_KEY: undefined },
    () => {
      const cfg = loadConfig();
      assert.equal(cfg.prowlarr.url, "http://127.0.0.1:9696");
      assert.equal(cfg.web.port, 8787);
    },
  );
});
