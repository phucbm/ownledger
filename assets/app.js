// ownledger dashboard: plain JS, no third-party code. All data from /api (same origin, signed session).
const $ = (s, el = document) => el.querySelector(s);
const main = $("#main");
const tip = $("#tip");
let ME = null;
let META = null;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => (n === null || n === undefined ? "—" : new Intl.NumberFormat(ME?.locale === "vi" ? "vi-VN" : "en-US").format(Math.round(n)));
const money = (n) => `${fmt(n)}${ME?.base === "VND" ? " ₫" : ` ${ME?.base ?? ""}`}`;
const short = (n) => {
  const a = Math.abs(n);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M` : a >= 1e3 ? `${Math.round(a / 1e3)}k` : String(Math.round(a));
  return (n < 0 ? "−" : "") + s;
};
const signed = (n) => `<span class="num ${n < 0 ? "neg" : ""}">${money(n)}</span>`;
const pct = (a, b) => (b ? `${a >= b ? "+" : "−"}${Math.abs(Math.round(((a - b) / Math.abs(b)) * 100))}%` : "");

async function api(path, init) {
  const r = await fetch(`/api/${path}`, { credentials: "same-origin", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (r.status === 401) {
    signIn();
    throw new Error("sign in");
  }
  const v = await r.json();
  if (!r.ok) throw new Error(v.error ?? r.status);
  return v;
}

function signIn() {
  main.innerHTML = `<div class="card empty"><h1>ownledger</h1><p>Your private ledger. Sign in with the GitHub account allowed on this Worker.</p><p><a href="/auth/login"><button class="primary">Sign in with GitHub</button></a></p></div>`;
  $("#nav").hidden = true;
}

/* ------------------------------------------------------------------ charts (SVG, hover tooltips) */

const NS = "http://www.w3.org/2000/svg";
function el(name, attrs = {}, parent) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
function showTip(ev, html) {
  tip.innerHTML = html;
  tip.hidden = false;
  const x = Math.min(ev.clientX + 14, innerWidth - tip.offsetWidth - 8);
  tip.style.left = `${x}px`;
  tip.style.top = `${ev.clientY + 14}px`;
}
const hideTip = () => (tip.hidden = true);

function niceTicks(min, max, n = 4) {
  if (min === max) max = min + 1;
  const span = max - min;
  const step0 = Math.pow(10, Math.floor(Math.log10(span / n)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * step0).find((s) => span / s <= n) ?? step0 * 10;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(v);
  return out;
}

/** One series line (net worth). Crosshair + tooltip. */
function lineChart(points, { label }) {
  const W = 480, H = 220, L = 46, R = 10, T = 12, B = 26;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": label });
  const vals = points.map((p) => p.v);
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(...vals));
  const y0 = ticks[0], y1 = ticks.at(-1);
  const x = (i) => L + (points.length === 1 ? 0 : (i * (W - L - R)) / (points.length - 1));
  const y = (v) => T + ((y1 - v) * (H - T - B)) / (y1 - y0);
  const g = el("g", { class: "grid" }, svg);
  for (const t of ticks) {
    el("line", { x1: L, x2: W - R, y1: y(t), y2: y(t) }, g);
    el("text", { x: L - 6, y: y(t) + 4, "text-anchor": "end" }, svg).textContent = short(t);
  }
  points.forEach((p, i) => {
    if (points.length <= 13 || i % Math.ceil(points.length / 12) === 0) el("text", { x: x(i), y: H - 6, "text-anchor": "middle" }, svg).textContent = p.label;
  });
  el("path", { d: points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.v)}`).join(""), fill: "none", stroke: "var(--series-1)", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
  const last = points.at(-1);
  el("circle", { cx: x(points.length - 1), cy: y(last.v), r: 4, fill: "var(--series-1)", stroke: "var(--surface-1)", "stroke-width": 2 }, svg);
  const cross = el("line", { y1: T, y2: H - B, stroke: "var(--text-muted)", "stroke-dasharray": "3 3", visibility: "hidden" }, svg);
  const dot = el("circle", { r: 4, fill: "var(--series-1)", stroke: "var(--surface-1)", "stroke-width": 2, visibility: "hidden" }, svg);
  const hit = el("rect", { x: L, y: T, width: W - L - R, height: H - T - B, fill: "transparent" }, svg);
  hit.addEventListener("pointermove", (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(points.length - 1, Math.round(((px - L) / (W - L - R)) * (points.length - 1))));
    cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
    dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(points[i].v)); dot.setAttribute("visibility", "visible");
    showTip(ev, `<b>${esc(points[i].label)}</b><br>${esc(label)}: ${money(points[i].v)}`);
  });
  hit.addEventListener("pointerleave", () => { hideTip(); cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); });
  return svg;
}

/** Grouped columns: income (series-1) and spending (series-2) per month. */
function columns(groups, series) {
  const W = 480, H = 220, L = 46, R = 10, T = 12, B = 26;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": series.map((s) => s.label).join(" and ") });
  const max = Math.max(1, ...groups.flatMap((g) => series.map((s) => g[s.key])));
  const ticks = niceTicks(0, max);
  const y1 = ticks.at(-1);
  const y = (v) => T + ((y1 - v) * (H - T - B)) / y1;
  const g0 = el("g", { class: "grid" }, svg);
  for (const t of ticks) {
    el("line", { x1: L, x2: W - R, y1: y(t), y2: y(t) }, g0);
    el("text", { x: L - 6, y: y(t) + 4, "text-anchor": "end" }, svg).textContent = short(t);
  }
  const band = (W - L - R) / groups.length;
  const bw = Math.min(24, (band - 8) / series.length - 2);
  groups.forEach((g, i) => {
    const cx = L + band * i + band / 2;
    series.forEach((s, j) => {
      const v = g[s.key];
      const h = Math.max(0, y(0) - y(v));
      const x0 = cx - (series.length * (bw + 2)) / 2 + j * (bw + 2);
      const r = Math.min(4, h / 2, bw / 2);
      const top = y(0) - h;
      el("path", { d: `M${x0},${y(0)} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${y(0)} Z`, fill: s.color }, svg);
    });
    el("text", { x: cx, y: H - 6, "text-anchor": "middle" }, svg).textContent = g.label;
    const hit = el("rect", { x: L + band * i, y: T, width: band, height: H - T - B, fill: "transparent" }, svg);
    hit.addEventListener("pointermove", (ev) => showTip(ev, `<b>${esc(g.label)}</b><br>${series.map((s) => `${esc(s.label)}: ${money(g[s.key])}`).join("<br>")}`));
    hit.addEventListener("pointerleave", hideTip);
  });
  return svg;
}

/** Horizontal bars, one hue (magnitude), value labels outside the bar end. */
function hbars(rows, { total }) {
  const W = 480, rowH = 26, L = 140, R = 90;
  const H = rows.length * rowH + 4;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": "Spending by category" });
  const max = Math.max(1, ...rows.map((r) => r.v));
  rows.forEach((r, i) => {
    const yy = i * rowH + 4;
    const w = Math.max(2, ((W - L - R) * r.v) / max);
    el("text", { x: L - 8, y: yy + 14, "text-anchor": "end" }, svg).textContent = r.label.length > 22 ? r.label.slice(0, 21) + "…" : r.label;
    const rr = Math.min(4, w / 2);
    el("path", { d: `M${L},${yy + 3} H${L + w - rr} Q${L + w},${yy + 3} ${L + w},${yy + 3 + rr} V${yy + 17 - rr} Q${L + w},${yy + 17} ${L + w - rr},${yy + 17} H${L} Z`, fill: "var(--series-2)" }, svg);
    el("text", { x: L + w + 6, y: yy + 14 }, svg).textContent = `${short(r.v)}${total ? ` · ${Math.round((r.v / total) * 100)}%` : ""}`;
    const hit = el("rect", { x: 0, y: yy, width: W, height: rowH, fill: "transparent" }, svg);
    hit.addEventListener("pointermove", (ev) => showTip(ev, `<b>${esc(r.label)}</b><br>${money(r.v)}${r.prev !== undefined ? `<br><span class="muted">previous: ${money(r.prev)}</span>` : ""}`));
    hit.addEventListener("pointerleave", hideTip);
  });
  return svg;
}

const tableOf = (head, rows) =>
  `<details class="table"><summary>Table</summary><table><tr>${head.map((h, i) => `<th class="${i ? "num" : ""}">${esc(h)}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? "num" : ""}">${i ? money(c) : esc(c)}</td>`).join("")}</tr>`).join("")}</table></details>`;

/* ------------------------------------------------------------------ pages */

const catName = (path) => META?.categories.find((c) => c.path === path)?.name ?? path;
const accName = (id) => META?.accounts.find((a) => a.id === id)?.name ?? id;
const typeName = (t) => META?.types[t]?.[ME?.locale === "vi" ? "vi" : "en"] ?? t;
const lineText = (l) => (l.account ? `<span class="pill">${esc(accName(l.account))}</span>` : `${esc(catName(l.category))}`);

async function overview() {
  const o = await api("overview");
  const m = o.month;
  const t = o.today;
  const dueItems = [
    ...t.due.map((d) => `<li>${esc(d.date)} · ${esc(d.name)} · ${money(d.amount)}${d.overdue ? ' <span class="status bad">⚠ overdue</span>' : ""}</li>`),
    ...t.cards.map((c) => `<li>${esc(c.dueDate)} · ${esc(c.name)} · pay ${money(c.toPay)}</li>`),
    ...t.maturing.map((d) => `<li>${esc(d.maturity)} · ${esc(d.name)} matures · ${money(d.principal)}</li>`),
    ...t.overBudget.map((b) => `<li><span class="status bad">⚠ over budget</span> ${esc(catName(b.category))}: ${money(b.spent)} / ${money(b.amount)}</li>`),
    ...t.odd.map((s) => `<li class="muted">${esc(s)}</li>`),
  ];
  main.innerHTML = `<h1>${esc(ME.name ?? "Overview")}</h1>
  <div class="grid">
    <div class="card stat"><div class="label">Net worth</div><div class="value">${money(o.netWorth.net)}</div><div class="delta">assets ${short(o.netWorth.assets)} · owed ${short(-o.netWorth.liabilities)}</div></div>
    <div class="card stat"><div class="label">Spent this month</div><div class="value">${money(m.expense)}</div><div class="delta">${m.previous ? `${pct(m.expense, m.previous.expense)} vs last month (${short(m.previous.expense)})` : ""}</div></div>
    <div class="card stat"><div class="label">Income this month</div><div class="value">${money(m.income)}</div><div class="delta">${m.previous ? `last month ${short(m.previous.income)}` : ""}</div></div>
  </div>
  <div class="grid two" style="margin-top:1rem">
    <div class="card"><h2>Net worth, 12 months</h2><div id="nw"></div></div>
    <div class="card"><h2>Due soon</h2>${dueItems.length ? `<ul>${dueItems.join("")}</ul>` : '<p class="muted">Nothing due in the next days.</p>'}</div>
    <div class="card"><h2>Spending this month</h2><div id="top"></div></div>
  </div>`;
  const pts = o.series.map((s) => ({ label: s.date.slice(2, 7), v: s.net }));
  $("#nw").append(lineChart(pts, { label: "Net worth" }));
  $("#nw").insertAdjacentHTML("beforeend", tableOf(["Month", "Net worth"], o.series.map((s) => [s.date.slice(0, 7), s.net])));
  const top = m.top.map((r) => ({ label: r.name, v: r.expense, prev: m.previous?.rows?.[r.key]?.expense }));
  if (top.length) $("#top").append(hbars(top, { total: m.expense }));
  else $("#top").innerHTML = '<p class="muted">No spending yet this month.</p>';
}

async function transactions(params) {
  const q = new URLSearchParams(params);
  if (!q.get("limit")) q.set("limit", "100");
  const r = await api(`transactions?${q}`);
  const opts = (list, sel) => list.map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? "selected" : ""}>${esc(l)}</option>`).join("");
  main.innerHTML = `<h1>Transactions</h1>
  <form class="filters" id="f">
    <input name="text" placeholder="Search note, who, event…" value="${esc(q.get("text") ?? "")}">
    <select name="account"><option value="">All accounts</option>${opts(META.accounts.filter((a) => !a.closed).map((a) => [a.id, a.name]), q.get("account"))}</select>
    <select name="category"><option value="">All categories</option>${opts(META.categories.map((c) => [c.path, `${c.parent ? "  " : ""}${c.name}`]), q.get("category"))}</select>
    <input name="from" type="date" value="${esc(q.get("from") ?? "")}"> <input name="to" type="date" value="${esc(q.get("to") ?? "")}">
    <button class="primary">Filter</button> <span class="muted small">${fmt(r.total)} found</span>
  </form>
  <div class="card"><table><tr><th>Date</th><th>Note</th><th>Lines</th><th class="num">Amount</th></tr>
  ${r.items.map((t) => {
    const size = t.lines.reduce((s, l) => s + (l.amount > 0 ? l.amount : 0), 0);
    const acc = t.lines.find((l) => l.account);
    return `<tr class="${t.void ? "void" : ""}"><td class="small">${esc(t.date)}${t.time ? `<br><span class="muted">${esc(t.time)}</span>` : ""}</td>
      <td>${esc(t.note)}${t.who ? ` <span class="pill">${esc(t.who)}</span>` : ""}${t.event ? ` <span class="pill">${esc(t.event)}</span>` : ""}${(t.tags ?? []).map((g) => ` <span class="pill">#${esc(g)}</span>`).join("")}</td>
      <td class="small">${t.lines.map(lineText).join(" → ")}</td>
      <td class="num">${t.lines.every((l) => l.account) ? money(size) : signed(acc ? acc.amount : -size)}</td></tr>`;
  }).join("")}</table>${r.total > r.items.length ? `<p class="muted small">Showing ${r.items.length} of ${fmt(r.total)}. Narrow the filters to see more.</p>` : ""}</div>`;
  $("#f").addEventListener("submit", (e) => {
    e.preventDefault();
    const p = new URLSearchParams([...new FormData(e.target)].filter(([, v]) => v));
    location.hash = `#/transactions?${p}`;
  });
}

async function accounts() {
  const list = await api("accounts");
  const showClosed = location.hash.includes("closed=1");
  const groups = {};
  for (const a of list) if (showClosed || !a.closed) (groups[a.type] ??= []).push(a);
  const cards = await api("cards");
  const deps = await api("deposits");
  main.innerHTML = `<h1>Accounts</h1><p class="small"><a href="#/accounts${showClosed ? "" : "?closed=1"}">${showClosed ? "Hide" : "Show"} closed accounts</a></p>
  <div class="grid two">${Object.entries(groups).map(([type, as]) => `<div class="card"><h2>${esc(typeName(type))} <span class="muted small">${money(as.reduce((s, a) => s + a.value, 0))}</span></h2>
  <table>${as.map((a) => {
    const c = cards.find((x) => x.account === a.id);
    const d = deps.find((x) => x.account === a.id);
    const extra = c ? `statement ${esc(c.statementDate ?? "?")} · pay ${money(c.toPay)} by ${esc(c.dueDate ?? "?")}${c.limit ? ` · available ${short(c.available)}` : ""}`
      : d ? `${d.rate ?? "?"}% · matures ${esc(d.maturity ?? "?")}${d.interestAtMaturity ? ` · +${short(d.interestAtMaturity)}` : ""}`
      : a.qty !== null && a.qty !== undefined ? `${a.qty} ${esc(a.asset)} · cost ${short(a.cost)}${a.priced ? "" : " · no price"}` : "";
    return `<tr><td>${esc(a.name)}${a.closed ? ' <span class="pill">closed</span>' : ""}${extra ? `<br><span class="muted small">${extra}</span>` : ""}</td><td class="num">${signed(a.value)}</td></tr>`;
  }).join("")}</table></div>`).join("")}</div>`;
}

async function plans() {
  const p = await api("plans?days=90");
  main.innerHTML = `<h1>Plans</h1><div class="grid two">
  <div class="card"><h2>Due in the next 90 days</h2>${p.due.length ? `<table>${p.due.map((d) => `<tr><td>${esc(d.date)}${d.overdue ? ' <span class="status bad">⚠ overdue</span>' : ""}</td><td>${esc(d.name)}</td><td class="num">${money(d.amount)}</td></tr>`).join("")}</table>` : '<p class="muted">Nothing due.</p>'}</div>
  <div class="card"><h2>All plans</h2>${p.status.length ? `<table><tr><th>Plan</th><th class="num">Paid</th><th class="num">Left</th><th>Next</th></tr>${p.status.map((s) => `<tr><td>${esc(s.name)}<br><span class="muted small">${esc(s.kind)} · ${esc(accName(s.account))} · ${money(s.perPayment)}</span></td><td class="num">${s.paidCount}${s.count ? `/${s.count}` : ""}</td><td class="num">${s.leftAmount === null ? "—" : money(s.leftAmount)}</td><td>${s.finished ? '<span class="status ok">✓ done</span>' : esc(s.next ?? "")}</td></tr>`).join("")}</table>` : '<p class="muted">No plans yet. Ask in chat: “add an instalment plan…”.</p>'}</div></div>`;
}

async function reports(params) {
  const q = new URLSearchParams(params);
  const period = q.get("period") ?? ME.today.slice(0, 4);
  const by = q.get("by") ?? "top";
  const r = await api(`report?period=${encodeURIComponent(period)}&by=${by}`);
  const months = await api(`report?period=${encodeURIComponent(period.slice(0, 4))}&by=month`);
  const years = [];
  for (let y = Number(ME.today.slice(0, 4)); y >= Number(ME.today.slice(0, 4)) - 8; y--) years.push(String(y));
  main.innerHTML = `<h1>Reports</h1>
  <form class="filters" id="f"><select name="period">${years.map((y) => `<option ${y === period ? "selected" : ""}>${y}</option>`).join("")}${period.length === 7 ? `<option selected>${esc(period)}</option>` : ""}</select>
  <select name="by">${[["top", "Top category"], ["category", "Category"], ["account", "Account"], ["who", "Who"], ["event", "Event"], ["tag", "Tag"]].map(([v, l]) => `<option value="${v}" ${v === by ? "selected" : ""}>${l}</option>`).join("")}</select>
  <input name="month" type="month" value="${period.length === 7 ? esc(period) : ""}" title="or one month"><button class="primary">Show</button></form>
  <div class="grid">
    <div class="card stat"><div class="label">Income</div><div class="value">${money(r.income)}</div><div class="delta">${r.previous ? `${pct(r.income, r.previous.income)} vs ${esc(r.previous.period.from.slice(0, 7))}…` : ""}</div></div>
    <div class="card stat"><div class="label">Spending</div><div class="value">${money(r.expense)}</div><div class="delta">${r.previous ? `${pct(r.expense, r.previous.expense)} vs previous` : ""}</div></div>
    <div class="card stat"><div class="label">Net</div><div class="value">${signed(r.net)}</div></div>
  </div>
  <div class="grid two" style="margin-top:1rem">
    <div class="card"><h2>By month, ${esc(period.slice(0, 4))}</h2><div class="legend"><span><i style="background:var(--series-1)"></i>Income</span><span><i style="background:var(--series-2)"></i>Spending</span></div><div id="cols"></div></div>
    <div class="card"><h2>Spending by ${by === "top" ? "category" : esc(by)}</h2><div id="bars"></div></div>
  </div>
  <div class="card" style="margin-top:1rem"><h2>Detail</h2><table><tr><th></th><th class="num">Income</th><th class="num">Spending</th><th class="num">Previous</th><th class="num">Rows</th></tr>
  ${r.rows.map((x) => { const pv = r.previous?.rows?.[x.key]; return `<tr><td>${esc(x.name)}</td><td class="num">${x.income ? money(x.income) : ""}</td><td class="num">${x.expense ? money(x.expense) : ""}</td><td class="num muted">${pv ? money(pv.expense || pv.income) : ""}</td><td class="num">${x.count}</td></tr>`; }).join("")}</table></div>`;
  const groups = months.rows.sort((a, b) => (a.key < b.key ? -1 : 1)).map((m) => ({ label: m.key.slice(5), income: m.income, expense: m.expense }));
  $("#cols").append(columns(groups, [{ key: "income", label: "Income", color: "var(--series-1)" }, { key: "expense", label: "Spending", color: "var(--series-2)" }]));
  $("#cols").insertAdjacentHTML("beforeend", tableOf(["Month", "Income", "Spending"], groups.map((g) => [g.label, g.income, g.expense])));
  const bars = r.rows.filter((x) => x.expense > 0).slice(0, 12).map((x) => ({ label: x.name, v: x.expense, prev: r.previous?.rows?.[x.key]?.expense }));
  if (bars.length) $("#bars").append(hbars(bars, { total: r.expense }));
  $("#f").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    location.hash = `#/reports?period=${f.get("month") || f.get("period")}&by=${f.get("by")}`;
  });
}

async function importPage() {
  const maps = await api("import/mappings");
  main.innerHTML = `<h1>Import</h1>
  <div class="card"><p>Import a newer export from an app you already imported once (its mapping is in <code>imports/</code>). The file is read in your browser and sent only to your own Worker. Nothing is written until you confirm.</p>
  ${maps.length ? `<form class="filters" id="f"><input type="file" name="file" accept=".xlsx,.csv,.json" required>
  <select name="mapping">${maps.map((m) => `<option>${esc(m)}</option>`).join("")}</select><button class="primary">Preview</button></form>`
  : '<p class="muted">No mapping yet. The first import of a new app is done once with the CLI and your AI (<code>npx ownledger import &lt;file&gt;</code>, see AGENTS.md).</p>'}
  <div id="out"></div></div>`;
  $("#f")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const file = f.get("file");
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    $("#out").innerHTML = '<p class="muted">Reading and reconciling…</p>';
    try {
      const r = await api("import/preview", { method: "POST", body: JSON.stringify({ file_name: file.name, base64: btoa(bin), mapping: f.get("mapping") }) });
      const p = r.report;
      const bad = p.reconcile.filter((x) => !x.ok);
      $("#out").innerHTML = `<h2>${p.ok ? '<span class="status ok">✓ Reconciles</span>' : '<span class="status bad">✗ Refused</span>'}</h2>
      <p>${fmt(p.rows)} rows · <b>${fmt(p.new)} new</b> · ${fmt(p.skipped)} already imported · ${p.accounts.length} new account(s) ${p.accounts.map((a) => `<span class="pill">${esc(a)}</span>`).join("")}</p>
      <p>${p.reconcile.length - bad.length}/${p.reconcile.length} accounts match the app's own balances.</p>
      ${bad.length ? `<table><tr><th>Account</th><th>Problem</th></tr>${bad.map((b) => `<tr><td>${esc(b.sheet)}</td><td>${esc(b.problems.join("; "))}</td></tr>`).join("")}</table>` : ""}
      ${p.unresolvedCategories.length ? `<p class="status bad">Categories not in the mapping:</p><ul>${p.unresolvedCategories.map((u) => `<li>${esc(u.key)} (${u.rows})</li>`).join("")}</ul>` : ""}
      ${p.unpaired.length ? `<p>Transfers without their other side: ${p.unpaired.length}</p>` : ""}
      ${p.changed.length || p.gone.length ? `<p class="status bad">⚠ ${p.changed.length} changed and ${p.gone.length} gone in the source: not applied, decide by hand.</p>` : ""}
      ${p.errors.length ? `<pre>${esc(p.errors.join("\n"))}</pre>` : ""}
      ${p.sample.length ? `<details class="table" open><summary>New transactions (first ${p.sample.length})</summary><table>${p.sample.map((t) => `<tr><td class="small">${esc(t.date)}</td><td>${esc(t.note)}</td><td class="small">${t.lines.map(lineText).join(" → ")}</td></tr>`).join("")}</table></details>` : ""}
      ${r.preview_id ? `<p><button class="primary" id="apply">Commit ${fmt(p.new)} transaction(s)</button> <span class="muted small">${esc(r.message)}</span></p>` : p.ok ? '<p class="muted">Nothing new to import.</p>' : ""}`;
      $("#apply")?.addEventListener("click", async (ev) => {
        ev.target.disabled = true;
        try {
          const a = await api("import/apply", { method: "POST", body: JSON.stringify({ preview_id: r.preview_id }) });
          $("#out").insertAdjacentHTML("beforeend", `<p class="status ok">✓ Committed ${esc(a.sha.slice(0, 10))}: ${esc(a.message)}</p>`);
        } catch (err) {
          $("#out").insertAdjacentHTML("beforeend", `<p class="status bad">✗ ${esc(err.message)}</p>`);
        }
      });
    } catch (err) {
      $("#out").innerHTML = `<p class="status bad">✗ ${esc(err.message)}</p>`;
    }
  });
}

async function settings() {
  const grants = await api("grants").catch(() => []);
  main.innerHTML = `<h1>Settings</h1><div class="grid two">
  <div class="card"><h2>Your ledger</h2><table>
    <tr><td>Signed in</td><td>${esc(ME.login)}</td></tr><tr><td>Data</td><td>${esc(ME.data)}</td></tr>
    <tr><td>Commit</td><td><code>${esc(ME.commit.slice(0, 12))}</code></td></tr><tr><td>ownledger</td><td>${esc(ME.version)}</td></tr>
    <tr><td>Check</td><td>${ME.check.errors ? `<span class="status bad">✗ ${ME.check.errors} error(s)</span>` : '<span class="status ok">✓ ok</span>'} ${ME.check.warnings ? `· ${ME.check.warnings} warning(s)` : ""}</td></tr>
    <tr><td>Connector</td><td><code>${esc(location.origin)}/mcp</code></td></tr></table>
    <form method="post" action="/auth/logout" style="margin-top:1rem"><button>Sign out</button></form></div>
  <div class="card"><h2>Connected AI apps</h2>${grants.length ? `<table>${grants.map((g) => `<tr><td>${esc(g.client)}<br><span class="muted small">since ${esc(new Date(g.created * 1000).toISOString().slice(0, 10))}</span></td><td class="num"><button data-g="${esc(g.id)}">Revoke</button></td></tr>`).join("")}</table>` : '<p class="muted">None yet. Add the connector URL in Claude or ChatGPT.</p>'}</div></div>`;
  main.querySelectorAll("button[data-g]").forEach((b) =>
    b.addEventListener("click", async () => {
      b.disabled = true;
      await api(`grants?id=${encodeURIComponent(b.dataset.g)}`, { method: "DELETE" });
      settings();
    }),
  );
}

/* ------------------------------------------------------------------ router */

const routes = { "": overview, transactions, accounts, plans, reports, import: importPage, settings };

async function route() {
  const [path, qs] = location.hash.replace(/^#\/?/, "").split("?");
  const page = routes[path] ?? overview;
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === `#/${path}`));
  hideTip();
  try {
    if (!ME) {
      ME = await api("me");
      META = await api("meta");
      $("#who").textContent = ME.login;
      document.documentElement.lang = ME.locale ?? "en";
    }
    await page(Object.fromEntries(new URLSearchParams(qs ?? "")));
  } catch (e) {
    if (e.message !== "sign in") main.innerHTML = `<div class="card"><p class="status bad">✗ ${esc(e.message)}</p></div>`;
  }
}
addEventListener("hashchange", route);
route();
