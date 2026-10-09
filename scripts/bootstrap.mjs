#!/usr/bin/env node
/**
 * One-shot setup: wait for Prowlarr, read its API key, import a set of public indexers.
 *
 *   node scripts/bootstrap.mjs                 # curated public set
 *   node scripts/bootstrap.mjs --list          # show every public definition
 *   node scripts/bootstrap.mjs --only "Nyaa.si,1337x"
 *   node scripts/bootstrap.mjs --test          # report connectivity afterwards
 */
import { loadConfig } from "../src/lib/config.mjs";
import { addIndexer, indexerSchema, listIndexers, systemStatus, testIndexer } from "../src/lib/prowlarr.mjs";

const CURATED = [
  "Knaben",
  "The Pirate Bay",
  "1337x",
  "LimeTorrents",
  "Torrent Downloads",
  "TorrentsCSV",
  "Internet Archive",
  "YTS",
  "EZTV",
  "Nyaa.si",
  "Anime Tosho",
  "SubsPlease",
  "dmhy",
  "Bangumi Moe",
  "Mikan",
  "EBookBay",
  "Anidex",
];

const args = process.argv.slice(2);
const cfg = loadConfig();
const flag = (name) => args.includes(name);
const value = (name) => {
  const hit = args.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
};

async function waitForProwlarr(seconds = 90) {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    try {
      const s = await systemStatus(cfg, 5000);
      console.log(`Prowlarr 已就绪：v${s.version} @ ${cfg.prowlarr.url}`);
      return;
    } catch (err) {
      if (Date.now() > deadline) {
        throw new Error(`等待 Prowlarr 超时（${cfg.prowlarr.url}）：${err.message}`);
      }
      process.stdout.write(".");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

if (!cfg.prowlarr.apiKey) {
  console.error(
    "没有找到 Prowlarr API key。设置 PROWLARR_API_KEY，或在 config.json 里填 prowlarr.api_key / prowlarr.config_xml。",
  );
  process.exit(1);
}

await waitForProwlarr();

const schema = await indexerSchema(cfg);
const byName = new Map(schema.map((d) => [d.name, d]));

if (flag("--list")) {
  for (const d of schema.filter((x) => x.privacy === "public").sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`  ${d.name}`);
  }
  process.exit(0);
}

const want = value("--only") ? value("--only").split(",").map((s) => s.trim()).filter(Boolean) : CURATED;
const have = new Set((await listIndexers(cfg)).map((i) => i.name));

let added = 0;
let skipped = 0;
for (const name of want) {
  if (have.has(name)) {
    console.log(`跳过 ${name}（已存在）`);
    skipped++;
    continue;
  }
  const def = byName.get(name);
  if (!def) {
    console.log(`找不到定义 ${name}`);
    continue;
  }
  if (def.privacy !== "public") {
    console.log(`跳过 ${name}（需要账号，非公网源）`);
    continue;
  }
  try {
    const created = await addIndexer(cfg, { ...def, name, enable: true, priority: 25, appProfileId: 1, tags: [] });
    console.log(`✓ 添加 ${name} (id=${created && created.id})`);
    added++;
  } catch (err) {
    console.log(`✗ ${name}：${String(err.message).replace(/\s+/g, " ").slice(0, 110)}`);
  }
}
console.log(`\n完成：新增 ${added}，已存在 ${skipped}。`);

if (flag("--test")) {
  const list = await listIndexers(cfg);
  for (const i of list) {
    try {
      const res = await testIndexer(cfg, i.id);
      const bad = Array.isArray(res) ? res.find((r) => r.isWarning || r.errorMessage) : null;
      console.log(`  ${i.name}: ${bad ? "异常 - " + String(bad.errorMessage).slice(0, 80) : "正常"}`);
    } catch (err) {
      console.log(`  ${i.name}: 失败 - ${String(err.message).slice(0, 80)}`);
    }
  }
}
