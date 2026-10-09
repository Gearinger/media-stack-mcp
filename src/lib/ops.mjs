import { magnetFor, resultView, search as prowlarrSearch, listIndexers, testIndexer, systemStatus } from "./prowlarr.mjs";
import {
  addTorrentFile,
  addUri,
  control,
  globalStat,
  tellActive,
  tellStopped,
  tellWaiting,
  version as ariaVersion,
} from "./aria2.mjs";
import { formatTorrent, size, torrentView } from "./format.mjs";

/**
 * Shared operations used by both the MCP server and the web API, so a search made in
 * one place can be downloaded by number in the other within the same process.
 */
export class Stack {
  constructor(cfg) {
    this.cfg = cfg;
    this.results = [];
    this.query = "";
    this.at = 0;
  }

  async search(query, { limit, indexers, timeoutMs } = {}) {
    const started = Date.now();
    const raw = await prowlarrSearch(this.cfg, query, { indexers, timeoutMs });
    const usable = raw.filter((r) => magnetFor(r) || r.downloadUrl);
    this.results = usable;
    this.query = query;
    this.at = Date.now();
    const capped = usable.slice(0, limit || this.cfg.search.defaultLimit);
    return {
      query,
      tookMs: Date.now() - started,
      total: raw.length,
      usable: usable.length,
      results: capped.map((r, i) => resultView(r, i + 1)),
    };
  }

  async download({ pick, url, dir } = {}) {
    const options = {};
    if (dir) options.dir = dir;
    let gid;
    let title;
    if (pick !== undefined && pick !== null) {
      const result = this.results[Number(pick) - 1];
      if (!result) {
        throw new Error(
          `没有第 ${pick} 条结果（当前缓存 ${this.results.length} 条` +
            `${this.query ? `，来自 "${this.query}"` : ""}）。先搜索一次。`,
        );
      }
      title = result.title;
      const magnet = magnetFor(result);
      gid = magnet ? await addUri(this.cfg, magnet, options) : await addTorrentFile(this.cfg, result.downloadUrl || result.guid, options);
    } else if (url) {
      title = url.slice(0, 120);
      gid = await addUri(this.cfg, url, options);
    } else {
      throw new Error("需要提供 pick 编号或 url");
    }
    return { gid, title, dir: dir || this.cfg.aria2.downloadDir || null };
  }

  async downloads(status = "all", limit = 20) {
    const groups = [];
    if (status === "active" || status === "all") {
      groups.push(["active", await tellActive(this.cfg)]);
    }
    if (status === "waiting" || status === "all") {
      groups.push(["waiting", await tellWaiting(this.cfg, limit)]);
    }
    if (status === "stopped" || status === "all") {
      groups.push(["stopped", await tellStopped(this.cfg, limit)]);
    }
    return groups
      .filter(([, list]) => list && list.length)
      .map(([group, list]) => ({ group, items: list.slice(0, limit).map(torrentView) }));
  }

  async downloadsText(status = "all", limit = 20) {
    const labels = { active: "进行中", waiting: "等待中", stopped: "已停止/完成" };
    const groups = await this.downloads(status, limit);
    if (!groups.length) return "当前没有下载任务。";
    return groups
      .map(({ group, items }) => {
        const body = items
          .map((v) => {
            const lines = [
              v.name,
              `  gid=${v.gid} status=${v.status} ${v.percent}%`,
              `  ${size(v.done)}/${size(v.total)}  速度 ${size(v.speed)}/s  剩余 ${v.eta}`,
              `  连接 seeds=${v.seeders ?? "?"} peers=${v.connections ?? "?"}`,
            ];
            if (v.error) lines.push(`  错误: ${v.error}`);
            return lines.join("\n");
          })
          .join("\n\n");
        return `【${labels[group]}】\n${body}`;
      })
      .join("\n\n");
  }

  control(action, gid) {
    return control(this.cfg, action, gid);
  }

  indexers() {
    return listIndexers(this.cfg);
  }

  async indexersText(withTest = false) {
    const list = await this.indexers();
    if (!list.length) return "Prowlarr 里还没有任何索引器。运行 npm run bootstrap 导入公网源。";
    const lines = list.map((i) => `  ${i.enable ? "启用" : "停用"}  ${i.name}`);
    if (!withTest) return `共 ${list.length} 个索引器：\n${lines.join("\n")}`;
    const out = [];
    for (const i of list) {
      try {
        const res = await testIndexer(this.cfg, i.id);
        const bad = Array.isArray(res) ? res.filter((r) => r.isWarning || r.errorMessage) : [];
        out.push(`  ${i.name}: ${bad.length ? "异常 - " + String(bad[0].errorMessage || "").slice(0, 70) : "正常"}`);
      } catch (err) {
        out.push(`  ${i.name}: 失败 - ${String(err.message).slice(0, 70)}`);
      }
    }
    return "索引器连通性测试：\n" + out.join("\n");
  }

  async status() {
    const lines = [];
    let prowlarrOk = false;
    try {
      const s = await systemStatus(this.cfg);
      prowlarrOk = true;
      lines.push(`Prowlarr: 正常 (v${s.version})`);
    } catch (err) {
      lines.push(`Prowlarr: 不可用 — ${String(err.message).slice(0, 140)}`);
    }
    let aria2Ok = false;
    try {
      const v = await ariaVersion(this.cfg);
      const g = await globalStat(this.cfg);
      aria2Ok = true;
      lines.push(
        `aria2: 正常 (v${v.version}) 下载 ${g.numActive} / 等待 ${g.numWaiting}，速度 ${size(g.downloadSpeed)}/s`,
      );
    } catch (err) {
      lines.push(`aria2: 不可用 — ${String(err.message).slice(0, 140)}`);
    }
    if (this.cfg.aria2.downloadDir) lines.push(`默认下载目录: ${this.cfg.aria2.downloadDir}`);
    return { text: lines.join("\n"), prowlarrOk, aria2Ok };
  }

  static formatTorrent = formatTorrent;
}
