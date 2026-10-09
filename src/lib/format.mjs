export function size(bytes) {
  if (!bytes) return "?";
  const units = ["B", "K", "M", "G", "T"];
  let n = Number(bytes);
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i >= 2 ? 2 : 0)}${units[i]}`;
}

export function pct(done, total) {
  const t = Number(total) || 0;
  return t ? (Number(done) / t) * 100 : 0;
}

export function eta(seconds) {
  const s = Number(seconds);
  if (!s || s <= 0 || !Number.isFinite(s)) return "-";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h${m}m` : `${m}m${String(Math.floor(s % 60)).padStart(2, "0")}s`;
}

export function torrentName(t) {
  const bt = t.bittorrent;
  if (bt && bt.info && bt.info.name) return bt.info.name;
  const files = t.files || [];
  const first = files.find((f) => f.path);
  if (first) {
    const parts = first.path.split("/").filter(Boolean);
    return parts.length > 1 ? parts[0] : parts[parts.length - 1];
  }
  return t.gid;
}

/** Normalised shape shared by the MCP tools and the web API. */
export function torrentView(t) {
  return {
    gid: t.gid,
    name: torrentName(t),
    status: t.status,
    done: Number(t.completedLength) || 0,
    total: Number(t.totalLength) || 0,
    percent: Number(pct(t.completedLength, t.totalLength).toFixed(1)),
    speed: Number(t.downloadSpeed) || 0,
    eta: eta(t.eta),
    seeders: t.numSeeders ?? null,
    connections: t.connections ?? null,
    dir: t.dir || null,
    error: t.errorMessage || null,
    files: (t.files || []).length,
  };
}

export function formatTorrent(t) {
  const v = torrentView(t);
  const lines = [
    v.name,
    `  gid=${v.gid} status=${v.status} ${v.percent}%`,
    `  ${size(v.done)}/${size(v.total)}  速度 ${size(v.speed)}/s  剩余 ${v.eta}`,
    `  连接 seeds=${v.seeders ?? "?"} peers=${v.connections ?? "?"}`,
  ];
  if (v.error) lines.push(`  错误: ${v.error}`);
  if (v.files > 1) lines.push(`  文件数 ${v.files}`);
  return lines.join("\n");
}
