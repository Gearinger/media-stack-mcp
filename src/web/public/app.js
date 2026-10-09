const $ = (id) => document.getElementById(id);
let pollTimer = null;

function toast(message, isError = false) {
  const el = $("toast");
  el.textContent = message;
  el.className = "toast show" + (isError ? " err" : "");
  setTimeout(() => (el.className = "toast"), 3200);
}

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function human(bytes) {
  if (!bytes) return "?";
  const u = ["B", "K", "M", "G", "T"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(i >= 2 ? 2 : 0) + u[i];
}

async function refreshHealth() {
  try {
    const s = await api("/api/status");
    $("dot-prowlarr").className = "dot " + (s.prowlarrOk ? "ok" : "bad");
    $("txt-prowlarr").textContent = s.prowlarrOk ? "Prowlarr 正常" : "Prowlarr 离线";
    $("dot-aria2").className = "dot " + (s.aria2Ok ? "ok" : "bad");
    $("txt-aria2").textContent = s.aria2Ok ? "aria2 正常" : "aria2 离线";
  } catch {
    $("dot-prowlarr").className = "dot bad";
    $("dot-aria2").className = "dot bad";
  }
}

function renderResults(data) {
  const box = $("results");
  if (!data.results.length) {
    box.innerHTML = `<p class="hint">没有可用结果。换关键词，或确认索引器状态。</p>`;
    return;
  }
  $("search-hint").textContent =
    `"${data.query}" · ${(data.tookMs / 1000).toFixed(1)}s · 原始 ${data.total} 条 / 可用 ${data.usable} 条`;
  box.innerHTML = data.results
    .map(
      (r) => `
      <div class="row">
        <div>
          <div class="title">${escapeHtml(r.title)}</div>
          <div class="meta"><span class="idx">${escapeHtml(r.indexer || "")}</span> · ${human(r.size)} ·
            <span class="seed">做种 ${r.seeders ?? "?"}</span> · 下载 ${r.leechers ?? "?"} ${r.category ? "· " + escapeHtml(r.category) : ""}</div>
        </div>
        <button data-pick="${r.pick}">下载</button>
      </div>`,
    )
    .join("");
  box.querySelectorAll("button[data-pick]").forEach((btn) =>
    btn.addEventListener("click", () => queue(Number(btn.dataset.pick), btn)),
  );
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

async function queue(pick, btn) {
  btn.disabled = true;
  try {
    const out = await api("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pick }),
    });
    toast(`已加入下载：${out.title.slice(0, 60)}`);
    refreshDownloads();
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
  }
}

async function refreshDownloads() {
  let data;
  try {
    data = await api("/api/downloads?status=all&limit=30");
  } catch (err) {
    $("downloads").innerHTML = `<p class="hint">${escapeHtml(err.message)}</p>`;
    return;
  }
  const flat = data.groups.flatMap((g) => g.items);
  if (!flat.length) {
    $("downloads").innerHTML = `<p class="hint">还没有任务。</p>`;
    return;
  }
  $("downloads").innerHTML = flat
    .map((t) => {
      const badge = t.error ? "error" : t.status === "active" ? "active" : t.status === "paused" ? "paused" : "";
      const controls =
        t.status === "active"
          ? `<button class="ghost small" data-act="pause" data-gid="${t.gid}">暂停</button>`
          : t.status === "paused"
            ? `<button class="ghost small" data-act="resume" data-gid="${t.gid}">继续</button>`
            : "";
      const done = ["complete", "error", "removed"].includes(t.status);
      return `
      <div class="card">
        <div class="top">
          <div>
            <div class="name">${escapeHtml(t.name)}</div>
            <div class="stat">${human(t.done)} / ${human(t.total)} · ${human(t.speed)}/s · 剩余 ${t.eta} ·
              seeds ${t.seeders ?? "?"} <span class="badge ${badge}">${t.status}</span></div>
          </div>
          <div class="btns">
            ${controls}
            <button class="ghost small" data-act="${done ? "purge" : "remove"}" data-gid="${t.gid}">${done ? "清除" : "移除"}</button>
          </div>
        </div>
        <div class="bar"><i style="width:${t.percent}%"></i></div>
        ${t.error ? `<div class="stat" style="color:var(--bad)">${escapeHtml(t.error)}</div>` : ""}
      </div>`;
    })
    .join("");
  $("downloads").querySelectorAll("button[data-act]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      try {
        await api("/api/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: btn.dataset.act, gid: btn.dataset.gid }),
        });
        refreshDownloads();
      } catch (err) {
        toast(err.message, true);
      }
    }),
  );
}

$("search-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = $("query").value.trim();
  if (!query) return;
  const btn = $("search-btn");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>搜索中`;
  $("search-hint").textContent = "正在查询各索引器，慢源需要等超时…";
  try {
    const data = await api(`/api/search?q=${encodeURIComponent(query)}&limit=${$("limit").value}`);
    renderResults(data);
  } catch (err) {
    $("results").innerHTML = "";
    $("search-hint").textContent = err.message;
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "搜索";
  }
});

$("refresh").addEventListener("click", refreshDownloads);

$("purge-done").addEventListener("click", async () => {
  try {
    const data = await api("/api/downloads?status=stopped&limit=50");
    const items = data.groups.flatMap((g) => g.items);
    for (const t of items) {
      await api("/api/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "purge", gid: t.gid }),
      });
    }
    toast(items.length ? `已清理 ${items.length} 条记录` : "没有需要清理的记录");
    refreshDownloads();
  } catch (err) {
    toast(err.message, true);
  }
});

refreshHealth();
refreshDownloads();
setInterval(refreshHealth, 15000);
pollTimer = setInterval(refreshDownloads, 2500);
