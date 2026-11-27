/* BaiduPCS Web - SPA (프레임워크 없이 동작) */
(() => {
"use strict";

// =================================================================== 유틸
// append/replaceChildren 에 null·false 가 섞여도 무시하도록 (조건부 렌더링 편의)
for (const proto of [Element.prototype, DocumentFragment.prototype]) {
  for (const m of ["append", "replaceChildren"]) {
    const orig = proto[m];
    proto[m] = function (...args) { return orig.apply(this, args.flat(Infinity).filter((x) => x != null && x !== false)); };
  }
}
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "html") el.innerHTML = v;
      else if (k in el && typeof v !== "string") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const ICONS = {
  files: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  tasks: '<path d="M12 4v11m-4-4 4 4 4-4M5 20h14"/>',
  local: '<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.5-8.97A6 6 0 0 1 18 10a4 4 0 0 1 0 8z"/><path d="M12 10v6m-2.5-2.5L12 16l2.5-2.5"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  account: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  up: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 4v11m-4-4 4 4 4-4M5 20h14"/>',
  upload: '<path d="M12 20V9m-4 4 4-4 4 4M5 4h14"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  tree: '<path d="M5 4v16M5 8h6M5 14h6M5 20h6"/><rect x="11" y="5" width="8" height="5" rx="1"/><rect x="11" y="11.5" width="8" height="5" rx="1"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  play: '<path d="M7 5v14l11-7z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  log: '<path d="M6 4h9l4 4v12H6z"/><path d="M14 4v5h5M9 13h7M9 17h5"/>',
  folderPlus: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v6M9 13h6"/>',
};
function icon(name) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.innerHTML = ICONS[name] || "";
  return s;
}

const FILE_KINDS = [
  [/\.(mp4|mkv|avi|mov|wmv|flv|ts|m2ts|rmvb|webm|m4v|iso)$/i, "#6B5BD2", "video"],
  [/\.(mp3|flac|wav|aac|m4a|ogg|ape|dsf|dff)$/i, "#C2417A", "audio"],
  [/\.(jpe?g|png|gif|webp|bmp|heic|tiff?|raw|svg)$/i, "#13865B", "image"],
  [/\.(zip|rar|7z|tar|gz|bz2|xz|zst)$/i, "#A86A12", "archive"],
  [/\.(pdf|docx?|xlsx?|pptx?|txt|md|epub|mobi|azw3|csv)$/i, "#2E6FD2", "doc"],
];
function fileIcon(name, isDir) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("class", "ico");
  if (isDir) {
    s.innerHTML = '<path d="M2.5 6.5a2 2 0 0 1 2-2h4.6l2 2h8.4a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2z" fill="#E9B949"/><path d="M2.5 9h19v8.5a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2z" fill="#F4CC5E"/>';
    return s;
  }
  let color = "#8D99A8";
  for (const [re, c] of FILE_KINDS) if (re.test(name)) { color = c; break; }
  s.innerHTML = `<path d="M6 2.5h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1z" fill="${color}" opacity=".18"/><path d="M6 2.5h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1z" fill="none" stroke="${color}" stroke-width="1.4"/><path d="M14 2.5v5h5" fill="none" stroke="${color}" stroke-width="1.4"/>`;
  return s;
}

function fmtSize(n) {
  n = Number(n) || 0;
  const u = ["B", "KB", "MB", "GB", "TB", "PB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return i === 0 ? `${n} B` : `${n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2)} ${u[i]}`;
}
function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec));
  const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
  return hh ? `${hh}시간 ${mm}분` : mm ? `${mm}분 ${ss}초` : `${ss}초`;
}
function joinPath(base, name) { return (base === "/" ? "" : base.replace(/\/$/, "")) + "/" + name; }
function parentPath(p) { if (!p || p === "/") return "/"; const i = p.replace(/\/$/, "").lastIndexOf("/"); return i <= 0 ? "/" : p.slice(0, i); }
function baseName(p) { return p.replace(/\/$/, "").split("/").pop() || "/"; }

const store = {
  get(k, d) { try { const v = localStorage.getItem("pcsweb." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("pcsweb." + k, JSON.stringify(v)); } catch { /* 무시 */ } },
};

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return toast("복사했습니다.", "ok"); }
  } catch { /* 아래 방식 사용 */ }
  const ta = h("textarea", { style: { position: "fixed", opacity: "0" } }, text);
  document.body.append(ta); ta.select();
  try { document.execCommand("copy"); toast("복사했습니다.", "ok"); } catch { toast("복사하지 못했습니다. 직접 선택해 복사하세요.", "err"); }
  ta.remove();
}

// =================================================================== API
class ApiError extends Error {}
async function api(method, url, body, opts = {}) {
  const init = { method, headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body); }
  const res = await fetch(url, init);
  if (res.status === 401 && !opts.noAuthRedirect) { showGate(); throw new ApiError("로그인이 필요합니다."); }
  let data = null;
  try { data = await res.json(); } catch { /* 본문 없음 */ }
  if (!res.ok) {
    let msg = data && data.detail;
    if (Array.isArray(msg)) msg = msg.map((d) => d.msg).join(", ");
    throw new ApiError(msg || `요청 실패 (${res.status})`);
  }
  return data;
}
const GET = (u) => api("GET", u);
const POST = (u, b) => api("POST", u, b ?? {});
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "")).toString();

// 버튼을 잠깐 잠그고 비동기 작업 실행
async function busy(btn, fn) {
  if (btn) { btn.classList.add("busy"); btn.disabled = true; }
  try { return await fn(); }
  catch (e) { toast(e.message || String(e), "err"); }
  finally { if (btn) { btn.classList.remove("busy"); btn.disabled = false; } }
}

// =================================================================== 토스트/모달
function toast(msg, kind = "") {
  const el = h("div", { class: `toast ${kind}` }, msg);
  $("#toasts").append(el);
  setTimeout(() => el.remove(), kind === "err" ? 6500 : 3500);
}

function modal({ title, body, actions = [], wide = false, onClose }) {
  return new Promise((resolve) => {
    const back = h("div", { class: "modal-back" });
    const close = (v) => { back.remove(); document.removeEventListener("keydown", onKey); onClose && onClose(); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") close(null); };
    document.addEventListener("keydown", onKey);
    const foot = actions.length ? h("div", { class: "modal-foot" }, actions.map((a) => {
      const b = h("button", { class: `btn ${a.kind || ""}`, type: a.submit ? "submit" : "button" }, a.label);
      b.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!a.onClick) return close(a.value ?? null);
        const r = await busy(b, () => a.onClick(close));
        if (r !== false && r !== undefined) close(r);
      });
      return b;
    })) : null;
    const m = h("form", { class: `modal ${wide ? "wide" : ""}`, onsubmit: (e) => { e.preventDefault(); const p = $(".modal-foot .btn.primary", m); p && p.click(); } },
      h("div", { class: "modal-head" }, h("h3", null, title),
        h("button", { class: "icon-btn plain", type: "button", "aria-label": "닫기", onclick: () => close(null) }, icon("close"))),
      h("div", { class: "modal-body" }, body), foot);
    back.addEventListener("mousedown", (e) => { if (e.target === back) close(null); });
    back.append(m);
    $("#modal-root").append(back);
    const first = $("input:not([type=checkbox]), textarea, select", m);
    if (first) setTimeout(() => first.focus(), 30);
  });
}

function confirmBox(title, message, { danger = false, ok = "확인" } = {}) {
  return modal({ title, body: h("p", { style: { margin: 0, whiteSpace: "pre-wrap" } }, message),
    actions: [{ label: "취소", value: false }, { label: ok, kind: danger ? "danger solid primary" : "primary", value: true }] });
}

function promptBox(title, label, value = "", { ok = "확인", help } = {}) {
  const input = h("input", { class: "input", value });
  return modal({ title, body: h("div", { class: "field" }, h("label", null, label), input, help && h("p", { class: "help" }, help)),
    actions: [{ label: "취소" }, { label: ok, kind: "primary", onClick: () => input.value.trim() || false }] });
}

function showOutput(title, text, extra) {
  const pre = h("pre", { class: "output wrap" }, text || "");
  return modal({ title, wide: true, body: [extra, pre],
    actions: [{ label: "복사", onClick: () => { copyText(pre.textContent); return false; } }, { label: "닫기", kind: "primary" }] });
}

function popMenu(anchor, items) {
  $$(".menu").forEach((m) => m.remove());
  const menu = h("div", { class: "menu", role: "menu" }, items.map((it) => it === "-" ? h("hr") :
    h("button", { class: it.danger ? "danger" : "", onclick: () => { menu.remove(); it.onClick(); } }, it.label)));
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  menu.style.left = Math.max(8, Math.min(r.right - mw, innerWidth - mw - 8)) + "px";
  menu.style.top = (r.bottom + mh + 8 > innerHeight ? r.top - mh - 4 : r.bottom + 4) + "px";
  setTimeout(() => document.addEventListener("mousedown", function off(e) {
    if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("mousedown", off); }
  }), 0);
}

// =================================================================== 폴더 선택기
async function pickRemoteFolder(start = "/", title = "넷디스크 폴더 선택") {
  let cur = start || "/";
  const pathInput = h("input", { class: "input", value: cur });
  const list = h("div", { class: "picker-list" });
  async function load(p) {
    list.replaceChildren(h("div", { class: "loading" }, "불러오는 중"));
    try {
      const r = await GET("/api/fs/ls?" + qs({ path: p }));
      if (!r.ok) throw new ApiError(r.output || "폴더를 열 수 없습니다.");
      cur = r.path; pathInput.value = cur;
      const dirs = r.items.filter((i) => i.is_dir);
      list.replaceChildren(
        cur !== "/" ? h("button", { type: "button", onclick: () => load(parentPath(cur)) }, icon("up"), "상위 폴더") : null,
        ...dirs.map((d) => h("button", { type: "button", onclick: () => load(d.path) }, fileIcon(d.name, true), d.name)),
        dirs.length ? null : h("div", { class: "muted small", style: { padding: "12px" } }, "하위 폴더가 없습니다."));
    } catch (e) { list.replaceChildren(h("div", { class: "notice err", style: { margin: "10px" } }, e.message)); }
  }
  load(cur);
  const newBtn = h("button", { class: "btn sm", type: "button", onclick: async () => {
    const name = await promptBox("새 폴더", "폴더 이름");
    if (!name) return;
    const r = await POST("/api/fs/mkdir", { path: joinPath(cur, name) });
    r.ok ? load(joinPath(cur, name)) : toast(r.output, "err");
  } }, icon("folderPlus"), "새 폴더");
  return modal({ title, body: [h("div", { class: "input-row" }, pathInput,
      h("button", { class: "btn", type: "button", onclick: () => load(pathInput.value.trim() || "/") }, "이동"), newBtn), list],
    actions: [{ label: "취소" }, { label: "이 폴더 선택", kind: "primary", onClick: () => pathInput.value.trim() || "/" }] });
}

async function pickLocalFolder(startAbs) {
  const info = state.info;
  let root = startAbs && startAbs.startsWith(info.upload_dir) ? "uploads" : "downloads";
  let rel = "";
  if (startAbs) {
    const base = root === "uploads" ? info.upload_dir : info.download_dir;
    rel = startAbs.slice(base.length).replace(/^\//, "");
  }
  let curAbs = startAbs || info.download_dir;
  const pathLabel = h("div", { class: "mono", style: { marginBottom: "8px", wordBreak: "break-all" } });
  const list = h("div", { class: "picker-list" });
  async function load(r, p) {
    list.replaceChildren(h("div", { class: "loading" }, "불러오는 중"));
    try {
      const d = await GET("/api/local/list?" + qs({ root: r, path: p }));
      root = r; rel = d.path; curAbs = d.abs; pathLabel.textContent = curAbs;
      const dirs = d.items.filter((i) => i.is_dir);
      list.replaceChildren(
        rel ? h("button", { type: "button", onclick: () => load(root, parentPath("/" + rel).slice(1)) }, icon("up"), "상위 폴더") : null,
        ...dirs.map((x) => h("button", { type: "button", onclick: () => load(root, x.rel) }, fileIcon(x.name, true), x.name)),
        dirs.length ? null : h("div", { class: "muted small", style: { padding: "12px" } }, "하위 폴더가 없습니다."));
    } catch (e) { list.replaceChildren(h("div", { class: "notice err", style: { margin: "10px" } }, e.message)); }
  }
  load(root, rel);
  const newBtn = h("button", { class: "btn sm", type: "button", onclick: async () => {
    const name = await promptBox("새 폴더", "폴더 이름");
    if (!name) return;
    await POST("/api/local/mkdir", { root, path: (rel ? rel + "/" : "") + name });
    load(root, (rel ? rel + "/" : "") + name);
  } }, icon("folderPlus"), "새 폴더");
  return modal({ title: "NAS 저장 폴더 선택",
    body: [h("div", { class: "row", style: { marginBottom: "10px" } },
        h("div", { class: "seg" },
          h("button", { type: "button", onclick: () => load("downloads", "") }, "다운로드 폴더"),
          h("button", { type: "button", onclick: () => load("uploads", "") }, "업로드 폴더")),
        h("span", { class: "spacer" }), newBtn), pathLabel, list],
    actions: [{ label: "취소" }, { label: "이 폴더 선택", kind: "primary", onClick: () => curAbs }] });
}

// =================================================================== 전역 상태
const state = { info: null, quota: null, running: 0, view: null, timers: [] };

const NAV = [
  { id: "files", label: "내 넷디스크", icon: "files" },
  { id: "tasks", label: "전송 현황", icon: "tasks", badge: true },
  { id: "local", label: "NAS 파일", icon: "local" },
  "-",
  { id: "transfer", label: "공유 링크 저장", icon: "link" },
  { id: "offline", label: "오프라인 다운로드", icon: "cloud" },
  { id: "share", label: "내 공유", icon: "share" },
  { id: "recycle", label: "휴지통", icon: "trash" },
  "-",
  { id: "terminal", label: "터미널", icon: "terminal" },
  { id: "config", label: "설정", icon: "config" },
  { id: "account", label: "계정", icon: "account" },
];

function renderNav(active) {
  $("#nav").replaceChildren(...NAV.map((n) => n === "-" ? h("div", { class: "nav-sep" }) :
    h("a", { class: `nav-item ${active === n.id ? "active" : ""}`, href: `#/${n.id}`, onclick: () => document.body.classList.remove("nav-open") },
      icon(n.icon), n.label, n.badge && state.running ? h("span", { class: "badge" }, state.running) : null)));
}

function renderChrome() {
  const cur = state.info && state.info.current;
  const chip = $("#account-chip");
  chip.className = "account-chip" + (cur ? "" : " off");
  chip.replaceChildren(h("span", { class: "avatar" }, cur ? (cur.name || "?").slice(0, 1).toUpperCase() : "?"),
    h("span", { class: "name" }, cur ? cur.name || cur.uid : "로그인 필요"));
  const q = state.quota;
  $("#gauge").hidden = !q;
  if (q) {
    $("#gauge-used").textContent = fmtSize(q.used) + " 사용";
    $("#gauge-total").textContent = fmtSize(q.total);
    $("#gauge-fill").style.width = Math.min(100, (q.used / q.total) * 100).toFixed(1) + "%";
  }
}

async function refreshInfo() {
  state.info = await GET("/api/info");
  renderChrome();
  return state.info;
}
async function refreshQuota() {
  if (!state.info || !state.info.current) { state.quota = null; renderChrome(); return; }
  try { const r = await GET("/api/quota"); state.quota = r.quota; } catch { state.quota = null; }
  renderChrome();
}
async function pollBadge() {
  try {
    const r = await GET("/api/tasks");
    trackTaskStatus(r.tasks);
    if (r.running !== state.running) { state.running = r.running; renderNav(currentRoute().page); }
  } catch { /* 무시 */ }
}

// 작업이 끝나면 화면 안 토스트와 (켜 두었다면) 브라우저 알림으로 알려준다
const taskStatus = new Map();
let taskStatusReady = false;
function trackTaskStatus(tasks) {
  for (const t of tasks) {
    const prev = taskStatus.get(t.id);
    taskStatus.set(t.id, t.status);
    if (!taskStatusReady || !prev || prev === t.status) continue;
    if (!["running", "queued"].includes(prev) || !["done", "failed"].includes(t.status)) continue;
    const ok = t.status === "done";
    const msg = `${ok ? "완료" : "실패"}: ${t.title}`;
    toast(msg, ok ? "ok" : "err");
    if (document.hidden && browserNotifyOn()) {
      try { new Notification(ok ? "전송 완료" : "전송 실패", { body: t.title + (ok ? "" : "\n" + (t.error || "")), tag: t.id }); } catch { /* 무시 */ }
    }
  }
  taskStatusReady = true;
}
const browserNotifySupported = () => "Notification" in window && window.isSecureContext;
const browserNotifyOn = () => browserNotifySupported() && Notification.permission === "granted" && store.get("browserNotify", false);

function requireLogin(view) {
  if (state.info && state.info.current) return true;
  view.replaceChildren(h("div", { class: "panel" }, h("div", { class: "empty" },
    h("h3", null, "바이두 계정에 먼저 로그인하세요"),
    h("p", null, "Cookies 또는 BDUSS 값으로 로그인하면 넷디스크를 열 수 있습니다."),
    h("a", { class: "btn primary", href: "#/account" }, "계정 화면으로 이동"))));
  return false;
}

// =================================================================== 라우터
function currentRoute() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [page, query] = raw.split("?");
  return { page: page || "files", params: new URLSearchParams(query || "") };
}
function go(page, params) { location.hash = `#/${page}` + (params ? "?" + qs(params) : ""); }

const PAGES = {};
const TITLES = { files: "내 넷디스크", tasks: "전송 현황", local: "NAS 파일", transfer: "공유 링크 저장", offline: "오프라인 다운로드",
  share: "내 공유", recycle: "휴지통", terminal: "터미널", config: "설정", account: "계정" };

function route() {
  const { page, params } = currentRoute();
  state.timers.forEach(clearInterval); state.timers = [];
  if (state.cleanup) { try { state.cleanup(); } catch { /* 무시 */ } state.cleanup = null; }
  renderNav(page);
  $("#page-title").textContent = TITLES[page] || "";
  document.title = `${TITLES[page] || ""} · BaiduPCS Web`;
  const view = $("#view");
  view.replaceChildren();
  (PAGES[page] || PAGES.files)(view, params);
}

// =================================================================== 넷디스크 파일
PAGES.files = (view, params) => {
  if (!requireLogin(view)) return;
  const st = {
    path: params.get("path") || store.get("lastPath", "/"),
    sort: store.get("sort", "name"), order: store.get("order", "asc"),
    items: [], selected: new Set(), filter: "", searchResults: null,
  };
  store.set("lastPath", st.path);

  const crumbs = h("div", { class: "crumbs" });
  const filterInput = h("input", { class: "input", placeholder: "찾기 · Enter 로 하위 폴더 검색", oninput: () => { st.filter = filterInput.value.trim().toLowerCase(); renderList(); },
    onkeydown: (e) => { if (e.key === "Enter" && filterInput.value.trim()) doSearch(filterInput.value.trim()); if (e.key === "Escape") { filterInput.value = ""; st.filter = ""; st.searchResults = null; renderList(); } } });
  const toolbar = h("div", { class: "toolbar" },
    h("button", { class: "icon-btn", title: "상위 폴더", onclick: () => open(parentPath(st.path)) }, icon("up")),
    crumbs,
    h("div", { class: "search-box" }, icon("search"), filterInput),
    h("button", { class: "icon-btn", title: "새로고침", onclick: () => load() }, icon("refresh")),
    h("button", { class: "icon-btn", title: "새 폴더", onclick: mkdir }, icon("folderPlus")),
    h("button", { class: "icon-btn", title: "더 보기", onclick: (e) => popMenu(e.currentTarget, [
      { label: "이 폴더 전체 다운로드", onClick: () => downloadDialog([st.path], [{ path: st.path, is_dir: true, size: 0 }]) },
      { label: "트리 보기", onClick: () => treeDialog(st.path) },
      { label: "폴더 정보 (meta)", onClick: () => metaDialog(st.path) },
      "-",
      { label: "공유 링크를 여기에 저장", onClick: () => go("transfer", { dest: st.path }) },
      { label: "오프라인 다운로드를 여기에 추가", onClick: () => go("offline", { path: st.path }) },
      { label: "NAS 파일을 여기에 업로드", onClick: () => go("local", { dest: st.path }) },
      "-",
      { label: "와일드카드로 다운로드…", onClick: wildcardDownload },
    ]) }, icon("more")));
  const selbar = h("div", { class: "selbar", hidden: true });
  const listWrap = h("div");
  const foot = h("div", { class: "list-foot" });
  view.append(h("div", { class: "panel" }, toolbar, selbar, listWrap, foot));

  function open(p) { go("files", { path: p }); }
  // 목록에서 이미 아는 크기·종류 정보를 다운로드 창에 넘겨 용량 계산을 빠르게 한다
  const infoOf = (paths) => paths.map((p) => [...(st.searchResults || []), ...st.items].find((i) => i.path === p) || { path: p, is_dir: true, size: 0 });
  const dl = (paths) => downloadDialog(paths, infoOf(paths));

  function renderCrumbs() {
    const parts = st.path.split("/").filter(Boolean);
    const nodes = [h("button", { onclick: () => open("/") }, "전체")];
    parts.forEach((p, i) => {
      nodes.push(h("span", { class: "sep" }, "/"));
      nodes.push(h("button", { onclick: () => open("/" + parts.slice(0, i + 1).join("/")), title: p }, p));
    });
    crumbs.replaceChildren(...nodes);
  }

  function visibleItems() {
    const src = st.searchResults || st.items;
    if (st.searchResults || !st.filter) return src;
    return src.filter((i) => i.name.toLowerCase().includes(st.filter));
  }

  function renderSelbar() {
    const n = st.selected.size;
    selbar.hidden = !n;
    if (!n) return;
    const paths = [...st.selected];
    selbar.replaceChildren(h("strong", null, `${n}개 선택`),
      h("button", { class: "btn sm primary", onclick: () => dl(paths) }, icon("download"), "다운로드"),
      h("button", { class: "btn sm", onclick: () => copyMove("cp", paths) }, "복사"),
      h("button", { class: "btn sm", onclick: () => copyMove("mv", paths) }, "이동"),
      h("button", { class: "btn sm", onclick: () => shareDialog(paths) }, "공유"),
      h("button", { class: "btn sm", onclick: () => locateDialog(paths.filter((p) => !(st.items.find((i) => i.path === p) || {}).is_dir)) }, "직링크"),
      h("button", { class: "btn sm danger", onclick: () => remove(paths) }, "삭제"),
      h("span", { class: "spacer" }),
      h("button", { class: "btn sm ghost", onclick: () => { st.selected.clear(); renderList(); } }, "선택 해제"));
  }

  function sortHeader(key, label, cls) {
    const active = st.sort === key;
    return h("th", { class: `${cls} sortable`, onclick: () => {
      if (st.searchResults) return;
      st.order = active && st.order === "asc" ? "desc" : "asc"; st.sort = key;
      store.set("sort", st.sort); store.set("order", st.order); load();
    } }, label, active ? (st.order === "asc" ? " ↑" : " ↓") : "");
  }

  function renderList() {
    const items = visibleItems();
    renderSelbar();
    if (st.searchResults && !items.length) {
      listWrap.replaceChildren(h("div", { class: "empty" }, h("h3", null, "검색 결과가 없습니다"), h("p", null, "다른 키워드로 찾아보세요. 검색은 파일만 찾고 폴더는 찾지 않습니다.")));
      return;
    }
    if (!items.length) {
      listWrap.replaceChildren(h("div", { class: "empty" }, h("h3", null, st.filter ? "일치하는 항목이 없습니다" : "빈 폴더입니다"),
        h("p", null, st.filter ? "Enter 를 누르면 하위 폴더까지 검색합니다." : "공유 링크를 저장하거나 NAS 파일을 올려 보세요."),
        st.filter ? null : h("div", { class: "row", style: { justifyContent: "center" } },
          h("a", { class: "btn", href: "#/transfer?" + qs({ dest: st.path }) }, "공유 링크 저장"),
          h("a", { class: "btn", href: "#/local?" + qs({ dest: st.path }) }, "NAS 파일 업로드"))));
      return;
    }
    const allChecked = items.every((i) => st.selected.has(i.path));
    const headCheck = h("input", { type: "checkbox", checked: allChecked, "aria-label": "모두 선택", onchange: () => {
      items.forEach((i) => headCheck.checked ? st.selected.add(i.path) : st.selected.delete(i.path)); renderList(); } });
    const rows = items.map((it) => {
      const cb = h("input", { type: "checkbox", checked: st.selected.has(it.path), "aria-label": it.name, onchange: () => {
        cb.checked ? st.selected.add(it.path) : st.selected.delete(it.path); tr.classList.toggle("selected", cb.checked); renderSelbar(); } });
      const nameCell = it.is_dir
        ? h("a", { onclick: () => open(it.path), title: it.path }, it.name)
        : h("span", { class: "n", title: it.path }, it.name);
      const sub = st.searchResults ? h("span", { class: "sub" }, parentPath(it.path)) : null;
      const tr = h("tr", { class: st.selected.has(it.path) ? "selected" : "", ondblclick: () => it.is_dir ? open(it.path) : dl([it.path]) },
        h("td", { class: "c-check" }, cb),
        h("td", null, h("div", { class: "fname" }, fileIcon(it.name, it.is_dir), h("div", { style: { minWidth: 0 } }, nameCell, sub))),
        h("td", { class: "c-size" }, it.is_dir ? h("span", { class: "muted" }, "—") : fmtSize(it.size)),
        h("td", { class: "c-time" }, it.mtime),
        h("td", { class: "c-act" }, h("div", { class: "row-actions" },
          h("button", { class: "icon-btn plain", title: "다운로드", onclick: () => dl([it.path]) }, icon("download")),
          h("button", { class: "icon-btn plain", title: "더 보기", onclick: (e) => popMenu(e.currentTarget, rowMenu(it)) }, icon("more")))));
      return tr;
    });
    listWrap.replaceChildren(h("div", { style: { overflowX: "auto" } }, h("table", { class: "ftable" },
      h("thead", null, h("tr", null, h("th", { class: "c-check" }, headCheck), sortHeader("name", "이름", ""), sortHeader("size", "크기", "c-size"),
        sortHeader("time", "수정한 날짜", "c-time"), h("th", { class: "c-act" }))),
      h("tbody", null, rows))));
    const files = items.filter((i) => !i.is_dir);
    foot.replaceChildren(
      h("span", null, `폴더 ${items.length - files.length}개 · 파일 ${files.length}개`),
      h("span", null, `합계 ${fmtSize(files.reduce((a, b) => a + b.size, 0))}`),
      st.searchResults ? h("span", null, `“${filterInput.value}” 검색 결과`) : null,
      h("span", { class: "spacer" }), h("span", null, "더블클릭: 폴더 열기 / 파일 다운로드"));
  }

  function rowMenu(it) {
    return [
      { label: "다운로드…", onClick: () => dl([it.path]) },
      it.is_dir ? { label: "열기", onClick: () => open(it.path) } : { label: "다운로드 직링크 보기", onClick: () => locateDialog([it.path]) },
      "-",
      { label: "이름 바꾸기", onClick: () => rename(it) },
      { label: "복사…", onClick: () => copyMove("cp", [it.path]) },
      { label: "이동…", onClick: () => copyMove("mv", [it.path]) },
      { label: "공유 링크 만들기", onClick: () => shareDialog([it.path]) },
      "-",
      { label: "정보 (meta)", onClick: () => metaDialog(it.path) },
      it.is_dir ? { label: "트리 보기", onClick: () => treeDialog(it.path) } : null,
      { label: "경로 복사", onClick: () => copyText(it.path) },
      "-",
      { label: "삭제", danger: true, onClick: () => remove([it.path]) },
    ].filter(Boolean);
  }

  async function load() {
    renderCrumbs();
    st.searchResults = null;
    listWrap.replaceChildren(h("div", { class: "loading" }, "목록을 불러오는 중"));
    foot.replaceChildren();
    try {
      const r = await GET("/api/fs/ls?" + qs({ path: st.path, sort: st.sort, order: st.order }));
      if (!r.ok) {
        listWrap.replaceChildren(h("div", { class: "empty" }, h("h3", null, "폴더를 열 수 없습니다"),
          h("pre", { class: "output wrap", style: { textAlign: "left", maxWidth: "720px", margin: "0 auto 16px" } }, r.output),
          h("button", { class: "btn", onclick: () => open("/") }, "최상위로 이동")));
        return;
      }
      st.path = r.path; store.set("lastPath", st.path);
      st.items = r.items;
      const valid = new Set(r.items.map((i) => i.path));
      [...st.selected].forEach((p) => valid.has(p) || st.selected.delete(p));
      renderCrumbs(); renderList();
    } catch (e) { listWrap.replaceChildren(h("div", { class: "notice err", style: { margin: "14px" } }, e.message)); }
  }

  async function doSearch(kw) {
    listWrap.replaceChildren(h("div", { class: "loading" }, `“${kw}” 검색 중 (하위 폴더 포함)`));
    try {
      const r = await GET("/api/fs/search?" + qs({ keyword: kw, path: st.path, recursive: true }));
      st.searchResults = r.items;
      if (!r.items.length && r.output && /错误|失败/.test(r.output)) toast(r.output, "err");
      renderList();
    } catch (e) { toast(e.message, "err"); }
  }

  async function mkdir() {
    const name = await promptBox("새 폴더", "폴더 이름", "", { ok: "만들기" });
    if (!name) return;
    const r = await POST("/api/fs/mkdir", { path: joinPath(st.path, name) });
    r.ok ? (toast("폴더를 만들었습니다.", "ok"), load()) : toast(r.output, "err");
  }
  async function rename(it) {
    const name = await promptBox("이름 바꾸기", "새 이름", it.name, { ok: "바꾸기" });
    if (!name || name === it.name) return;
    const r = await POST("/api/fs/rename", { path: it.path, new_name: name });
    r.ok ? (toast("이름을 바꿨습니다.", "ok"), load()) : toast(r.output, "err");
  }
  async function copyMove(op, paths) {
    const dest = await pickRemoteFolder(st.path, op === "cp" ? `${paths.length}개 항목을 복사할 폴더` : `${paths.length}개 항목을 옮길 폴더`);
    if (!dest) return;
    const r = await POST(`/api/fs/${op}`, { paths, dest });
    if (r.ok) { toast(op === "cp" ? "복사했습니다." : "옮겼습니다.", "ok"); st.selected.clear(); load(); }
    else showOutput("작업 결과", r.output);
  }
  async function remove(paths) {
    const yes = await confirmBox("삭제", `${paths.length === 1 ? baseName(paths[0]) : paths.length + "개 항목"}을(를) 삭제할까요?\n삭제한 항목은 휴지통에서 되살릴 수 있습니다.`, { danger: true, ok: "삭제" });
    if (!yes) return;
    const r = await POST("/api/fs/rm", { paths });
    if (r.ok) { toast("삭제했습니다.", "ok"); paths.forEach((p) => st.selected.delete(p)); load(); refreshQuota(); }
    else showOutput("삭제 결과", r.output);
  }
  async function wildcardDownload() {
    const pat = await promptBox("와일드카드로 다운로드", "패턴", joinPath(st.path, "*.mp4"),
      { ok: "다운로드", help: "* 와 ? 를 쓸 수 있습니다. 예: /영상/*.mkv" });
    if (!pat) return;
    const r = await GET("/api/fs/match?" + qs({ pattern: pat }));
    const hits = (r.output || "").split("\n").map((s) => s.trim()).filter((s) => s.startsWith("/"));
    if (!hits.length) return showOutput("일치하는 파일 없음", r.output);
    downloadDialog(hits);
  }

  load();
};

// ------------------------------------------------------------ 파일 관련 대화상자
const DL_DEFAULTS = { overwrite: false, mode: "locate", threads: 0, load: 0, retry: 3, nocheck: false, mtime: true, fullpath: false, test: false, dindex: 0, exec_perm: false, separate: false };

async function downloadDialog(paths, info) {
  if (!paths.length) return;
  const o = { ...DL_DEFAULTS, ...store.get("dlopts", {}) };
  const saveto = h("input", { class: "input", value: store.get("dlSaveto", state.info.download_dir), onchange: () => updateSpace() });

  // ---- 필요 공간과 NAS 여유 공간 비교
  info = info || paths.map((p) => ({ path: p, is_dir: true, size: 0 }));
  const space = h("div", { class: "space-check" }, h("span", { class: "muted" }, "필요한 공간 계산 중…"));
  const need = { total: info.filter((i) => !i.is_dir).reduce((a, b) => a + b.size, 0), files: info.filter((i) => !i.is_dir).length, complete: true, done: false };
  let disk = null, closed = false;
  function renderSpace() {
    if (!need.done || !disk) {
      space.replaceChildren(h("span", { class: "muted" }, need.done ? "NAS 여유 공간 확인 중…" : "필요한 공간 계산 중… (폴더가 크면 조금 걸립니다)"));
      return;
    }
    const usable = disk.free - disk.min_free;
    const over = need.total > usable;
    space.className = "space-check " + (over ? "bad" : "ok");
    space.replaceChildren(
      h("div", null, h("strong", null, `필요 약 ${fmtSize(need.total)}${need.complete ? "" : " 이상"}`), ` (파일 ${need.files}개)`),
      h("div", null, `NAS 여유 ${fmtSize(disk.free)}`),
      over ? h("div", { class: "warn-line" }, `여유 공간이 부족합니다. 최소 여유 ${fmtSize(disk.min_free)} 를 남기려면 ${fmtSize(need.total - usable)} 를 더 비워야 합니다. 그래도 시작하면 공간이 기준 아래로 떨어질 때 자동으로 멈춥니다.`) : null,
      need.complete ? null : h("div", { class: "muted small" }, "폴더가 너무 많아 일부만 계산했습니다."));
  }
  async function updateSpace() {
    disk = null; renderSpace();
    try { disk = await GET("/api/local/disk?" + qs({ path: saveto.value.trim() })); } catch (e) { space.replaceChildren(h("span", { class: "warn-text" }, e.message)); return; }
    if (!closed) renderSpace();
  }
  (async () => {
    const dirs = info.filter((i) => i.is_dir).map((i) => i.path);
    if (dirs.length) {
      try {
        const r = await POST("/api/fs/size", { paths: dirs });
        need.total += r.total; need.files += r.files; need.complete = r.complete;
      } catch { need.complete = false; }
    }
    need.done = true;
    if (!closed) renderSpace();
  })();
  updateSpace();
  const chk = (k, label, sub) => h("label", { class: "check" }, h("input", { type: "checkbox", checked: !!o[k], onchange: (e) => { o[k] = e.target.checked; } }), h("span", null, label, sub && h("small", null, sub)));
  const num = (k, label, help) => h("div", { class: "field" }, h("label", null, label),
    h("input", { class: "input", type: "number", min: 0, value: o[k], oninput: (e) => { o[k] = parseInt(e.target.value || "0", 10); } }), help && h("p", { class: "help" }, help));
  const mode = h("select", { class: "input", onchange: (e) => { o.mode = e.target.value; } },
    [["locate", "locate (기본, 권장)"], ["pcs", "pcs"], ["stream", "stream"]].map(([v, l]) => h("option", { value: v, selected: o.mode === v }, l)));
  const list = h("div", { class: "mono muted", style: { maxHeight: "96px", overflow: "auto", marginBottom: "14px" } }, paths.map((p) => h("div", null, p)));
  const body = [
    list,
    h("div", { class: "field" }, h("label", null, "NAS 저장 위치"),
      h("div", { class: "input-row" }, saveto, h("button", { class: "btn", type: "button", onclick: async () => { const p = await pickLocalFolder(saveto.value); if (p) { saveto.value = p; updateSpace(); } } }, "찾아보기")),
      h("p", { class: "help" }, state.info.host_download_dir ? `${state.info.download_dir} = NAS 의 ${state.info.host_download_dir}` : `${state.info.download_dir} 는 docker-compose 에서 연결한 NAS 폴더입니다.`)),
    space,
    h("div", { class: "checks" },
      chk("mtime", "원본 수정 시간 유지", "넷디스크의 수정 시간을 그대로 씁니다"),
      chk("fullpath", "넷디스크 전체 경로로 저장", "/영상/a.mp4 → 저장위치/영상/a.mp4"),
      chk("overwrite", "같은 이름 파일 덮어쓰기", "끄면 이미 있는 파일은 건너뜁니다"),
      paths.length > 1 ? chk("separate", "항목마다 작업 나누기", "작업별로 따로 중지·재시도") : null),
    h("details", { class: "adv" }, h("summary", null, "고급 옵션"),
      h("div", { class: "field" }, h("label", null, "다운로드 방식"), mode),
      h("div", { class: "num-grid" },
        num("threads", "스레드 수 (-p)", "0 = 설정값"), num("load", "동시 파일 수 (-l)", "0 = 설정값"),
        num("retry", "재시도 횟수"), num("dindex", "대체 링크 번호", "0 = 첫 번째")),
      h("div", { class: "checks" },
        chk("nocheck", "완료 후 검증 생략"), chk("test", "테스트 다운로드", "파일을 저장하지 않음"), chk("exec_perm", "실행 권한 추가 (-x)"))),
    h("p", { class: "help", style: { margin: 0 } }, "일반 회원은 스레드를 늘리면 오히려 속도 제한에 걸리기 쉽습니다. 다시 받을 때는 이어받기가 됩니다."),
  ];
  const res = await modal({ title: `다운로드 (${paths.length}개)`, body, onClose: () => { closed = true; }, actions: [
    { label: "취소" },
    { label: "다운로드 시작", kind: "primary", onClick: async () => {
      const { separate, ...opts } = o;
      store.set("dlopts", o); store.set("dlSaveto", saveto.value.trim());
      return POST("/api/tasks/download", { paths, separate, options: { ...opts, saveto: saveto.value.trim() } });
    } }] });
  if (res && res.ok) {
    toast(`${res.tasks.length}개 작업을 전송 현황에 추가했습니다.`, "ok");
    state.running = Math.max(state.running, 1); renderNav(currentRoute().page);
  }
}

async function treeDialog(path) {
  const depth = h("input", { class: "input", type: "number", value: store.get("treeDepth", 2), min: -1, style: { width: "90px" } });
  const fsid = h("input", { type: "checkbox" });
  const pre = h("pre", { class: "output" });
  const run = h("button", { class: "btn primary", type: "button", onclick: () => busy(run, async () => {
    store.set("treeDepth", parseInt(depth.value, 10));
    pre.textContent = "불러오는 중…";
    const r = await GET("/api/fs/tree?" + qs({ path, depth: depth.value, fsid: fsid.checked }));
    pre.textContent = r.output;
  }) }, "보기");
  modal({ title: `트리 · ${path}`, wide: true,
    body: [h("div", { class: "row", style: { marginBottom: "12px" } }, h("span", null, "깊이"), depth, h("span", { class: "muted small" }, "-1 = 전체"),
      h("label", { class: "check" }, fsid, "fs_id 표시"), run), pre],
    actions: [{ label: "복사", onClick: () => { copyText(pre.textContent); return false; } }, { label: "닫기", kind: "primary" }] });
  run.click();
}

async function metaDialog(path) {
  const r = await GET("/api/fs/meta?" + qs({ path }));
  showOutput(`정보 · ${baseName(path)}`, r.output);
}

async function locateDialog(paths) {
  if (!paths.length) return toast("폴더는 직링크를 만들 수 없습니다. 파일을 선택하세요.", "err");
  const pan = h("input", { type: "checkbox" });
  const pre = h("pre", { class: "output wrap" });
  const run = h("button", { class: "btn primary", type: "button", onclick: () => busy(run, async () => {
    pre.textContent = "가져오는 중…";
    const r = await POST("/api/fs/locate", { paths, pan: pan.checked });
    pre.textContent = r.output;
  }) }, "다시 가져오기");
  modal({ title: "다운로드 직링크", wide: true,
    body: [h("div", { class: "notice info" }, "직링크는 바이두가 정한 User-Agent 로만 받을 수 있는 경우가 많습니다. 링크가 막히면 설정의 User-Agent 를 바꾸거나 이 앱의 다운로드를 쓰세요."),
      h("div", { class: "row", style: { marginBottom: "12px" } }, h("label", { class: "check" }, pan, "넷디스크 웹 방식으로 가져오기 (--pan)"), run), pre],
    actions: [{ label: "복사", onClick: () => { copyText(pre.textContent); return false; } }, { label: "닫기", kind: "primary" }] });
  run.click();
}

async function shareDialog(paths) {
  const code = h("input", { class: "input", placeholder: "비워두면 자동 생성 (4자리)", maxLength: 4 });
  const period = h("select", { class: "input" }, [["0", "영구"], ["1", "1일"], ["7", "7일"], ["30", "30일"], ["365", "365일"]].map(([v, l]) => h("option", { value: v }, l)));
  const out = h("pre", { class: "output wrap", hidden: true });
  await modal({ title: `공유 링크 만들기 (${paths.length}개)`, body: [
    h("div", { class: "mono muted", style: { maxHeight: "80px", overflow: "auto", marginBottom: "14px" } }, paths.map((p) => h("div", null, p))),
    h("div", { class: "num-grid" }, h("div", { class: "field" }, h("label", null, "추출 코드"), code), h("div", { class: "field" }, h("label", null, "유효 기간"), period)),
    out],
    actions: [{ label: "닫기" }, { label: "링크 만들기", kind: "primary", onClick: async () => {
      const r = await POST("/api/share/set", { paths, code: code.value.trim(), period: parseInt(period.value, 10), full: true });
      out.hidden = false; out.textContent = r.output;
      const link = (r.output.match(/https?:\/\/\S+/) || [])[0];
      if (link) copyText(link.replace(/,$/, ""));
      return false;
    } }] });
}

// =================================================================== 전송 현황
const STATUS = {
  queued: ["대기 중", ""], running: ["진행 중", "accent"], done: ["완료", "ok"], failed: ["실패", "danger"],
  stopped: ["중지됨", "warn"], interrupted: ["중단됨", "warn"],
};
const FSTATE = { queued: "대기", preparing: "준비 중", running: "받는 중", verifying: "검증 중", done: "완료", skipped: "건너뜀", failed: "실패", stopped: "중지", interrupted: "중단" };

PAGES.tasks = (view) => {
  // 목록을 통째로 다시 그리지 않고, 작업 카드와 파일 행을 id 로 기억해 바뀐 값만 고친다.
  // (스크롤 위치·버튼 클릭·텍스트 선택이 갱신 때문에 끊기지 않도록)
  let filter = store.get("taskFilter", "all");
  const open = new Set(store.get("openTasks", []));
  let hideDone = store.get("taskHideDone", false);
  const summary = h("div", { class: "task-summary" });
  const seg = h("div", { class: "seg" });
  const listEl = h("div");
  const emptyEl = h("div", { class: "empty", hidden: true }, h("h3"), h("p", null, "내 넷디스크에서 파일을 고르고 다운로드를 누르면 여기에 표시됩니다."));
  listEl.append(emptyEl);
  view.append(h("div", { class: "panel" }, summary), h("div", { class: "panel" },
    h("div", { class: "panel-head" }, seg, h("span", { class: "spacer" }),
      h("label", { class: "check small", style: { padding: 0 } },
        h("input", { type: "checkbox", checked: hideDone, onchange: (e) => { hideDone = e.target.checked; store.set("taskHideDone", hideDone); rerender(); } }),
        "완료된 파일 숨기기"),
      h("button", { class: "btn sm", onclick: async () => { const r = await POST("/api/tasks/clear"); toast(`${r.removed}개 기록을 정리했습니다.`); tick(); } }, "끝난 작업 정리")),
    listEl));

  const FILTERS = [["all", "전체"], ["active", "진행·대기"], ["done", "완료"], ["problem", "실패·중지"]];
  const match = (t, f) => f === "all" || (f === "active" && ["queued", "running"].includes(t.status)) || (f === "done" && t.status === "done") || (f === "problem" && ["failed", "stopped", "interrupted"].includes(t.status));
  const segBtns = FILTERS.map(([k]) => h("button", { onclick: () => { filter = k; store.set("taskFilter", k); rerender(); } }));
  seg.append(...segBtns);

  // 요약 영역도 한 번만 만들고 숫자만 바꾼다
  const sumRunning = h("strong"), sumQueued = h("strong"), sumSpeed = h("strong"), sumRunningLabel = h("span");
  summary.append(
    h("div", { class: "stat" }, sumRunning, sumRunningLabel),
    h("div", { class: "stat" }, sumQueued, h("span", null, "대기 중")),
    h("div", { class: "stat" }, sumSpeed, h("span", null, "현재 속도")),
    h("span", { class: "spacer" }),
    h("button", { class: "btn", onclick: () => go("files") }, icon("download"), "넷디스크에서 받기"));

  const setText = (el, v) => { v = v == null ? "" : String(v); if (el.textContent !== v) el.textContent = v; };
  const setClass = (el, v) => { if (el.className !== v) el.className = v; };
  const setWidth = (el, pct) => { const w = pct.toFixed(1) + "%"; if (el.style.width !== w) el.style.width = w; };

  const cards = new Map();   // task id → card
  let lastTasks = [];

  function kindLabel(t) {
    if (t.kind === "relay") return t.meta && t.meta.delete_after ? "경유 받기" : "링크 받기";
    return { download: "다운로드", upload: "업로드", transfer: "링크 저장" }[t.kind] || t.kind;
  }

  function createCard(t) {
    const c = { id: t.id, rows: new Map(), actionsKey: "" };
    c.statusTag = h("span");
    c.kindTag = h("span", { class: "tag" });
    c.acctTag = h("span", { class: "tag acct", hidden: true });
    c.title = h("span", { class: "task-title" });
    c.phase = h("div", { class: "task-phase", hidden: true });
    c.actions = h("div", { class: "row-actions", style: { gap: "6px", alignItems: "center" } });
    c.laneFill = h("i");
    c.lane = h("div", { class: "lane" }, c.laneFill);
    c.meta = h("div", { class: "task-meta" });
    c.toggle = h("button", { class: "linkish", type: "button", onclick: () => {
      open.has(c.id) ? open.delete(c.id) : open.add(c.id);
      store.set("openTasks", [...open]);
      updateCard(c, c.t);
      if (open.has(c.id)) jumpToActive(c);
    } });
    c.err = h("div", { class: "task-err", hidden: true });
    c.filesInfo = h("span", { class: "muted small" });
    c.jump = h("button", { class: "btn sm ghost", type: "button", onclick: () => jumpToActive(c) }, "받는 중인 파일로 이동");
    c.filesBar = h("div", { class: "tfile-bar" }, c.filesInfo, h("span", { class: "spacer" }), c.jump);
    c.filesList = h("div", { class: "task-files" });
    c.filesWrap = h("div", { hidden: true }, c.filesBar, c.filesList);
    c.el = h("div", { class: "task" },
      h("div", { class: "task-head" }, c.statusTag, c.kindTag, c.acctTag, c.title, h("span", { class: "spacer" }), c.actions),
      c.phase, c.lane, h("div", { class: "row", style: { gap: "14px", marginTop: "8px", alignItems: "baseline" } }, c.meta, c.toggle),
      c.err, c.filesWrap);
    return c;
  }

  function renderActions(c, t) {
    const running = ["queued", "running"].includes(t.status);
    const key = running ? "run" : (t.status === "done" ? "done" : "retry");
    if (c.actionsKey === key) return;
    c.actionsKey = key;
    c.actions.replaceChildren(
      running
        ? h("button", { class: "btn sm", onclick: (e) => busy(e.currentTarget, async () => { await POST(`/api/tasks/${c.id}/stop`); tick(); }) }, icon("stop"), "중지")
        : h("button", { class: "btn sm", onclick: (e) => busy(e.currentTarget, async () => { await POST(`/api/tasks/${c.id}/retry`); tick(); }) }, icon("play"), key === "done" ? "다시 실행" : "이어받기"),
      h("button", { class: "icon-btn plain", title: "로그", onclick: () => logDialog(c.id) }, icon("log")),
      h("button", { class: "icon-btn plain", title: "더 보기", onclick: (e) => {
        const t2 = c.t;   // 메뉴를 여는 시점의 최신 상태 사용
        popMenu(e.currentTarget, [
          t2.meta && t2.meta.saveto ? { label: "저장 폴더 열기 (NAS 파일)", onClick: () => openLocal(t2.meta.saveto) } : null,
          t2.meta && t2.meta.dest ? { label: "넷디스크 폴더 열기", onClick: () => go("files", { path: t2.meta.dest }) } : null,
          t2.meta && t2.meta.netdisk_dir && t2.meta.stage !== "done" ? { label: "넷디스크 저장 폴더 열기", onClick: () => go("files", { path: t2.meta.netdisk_dir }) } : null,
          t2.meta && t2.meta.link ? { label: "공유 링크 복사", onClick: () => copyText(t2.meta.code ? `${t2.meta.link}?pwd=${t2.meta.code}` : t2.meta.link) } : null,
          t2.args && t2.args.length ? { label: "명령어 복사", onClick: () => copyText("BaiduPCS-Go " + t2.args.map((a) => /\s/.test(a) ? `"${a}"` : a).join(" ")) } : null,
          "-",
          { label: "기록에서 삭제", danger: true, onClick: async () => {
            if (c.t.status === "running" && !await confirmBox("작업 삭제", "진행 중인 작업을 중지하고 삭제할까요?", { danger: true })) return;
            await api("DELETE", `/api/tasks/${c.id}`); tick();
          } },
        ].filter(Boolean));
      } }, icon("more")));
  }

  function fileRow(c, f) {
    let r = c.rows.get(f.id);
    if (!r) {
      r = { name: h("span", { class: "n" }), sub: h("small"), fill: h("i"), stateEl: h("div", { class: "r" }) };
      r.mini = h("div", { class: "mini" }, r.fill);
      r.p = h("div", { class: "p" }, r.name, r.sub);
      r.el = h("div", { class: "tfile" }, r.p, r.mini, r.stateEl);
      r.el.dataset.fid = f.id;
      c.rows.set(f.id, r);
    }
    const fp = f.total ? (f.done / f.total) * 100 : (f.state === "done" ? 100 : 0);
    setText(r.name, baseName(f.path || f.save_path || "#" + f.id));
    if (r.p.title !== (f.path || "")) r.p.title = f.path || "";
    setText(r.sub, f.message || parentPath(f.path || ""));
    setClass(r.mini, `mini ${f.state === "done" || f.state === "skipped" ? "done" : ""} ${f.state === "failed" ? "failed" : ""}`.trim());
    setWidth(r.fill, fp);
    const pctText = f.state === "running" && f.total ? ` ${fp.toFixed(1)}%` : "";
    setText(r.stateEl, (FSTATE[f.state] || f.state) + pctText
      + (f.state === "running" && f.speed ? ` · ${fmtSize(f.speed)}/s` : "")
      + (f.total ? ` · ${fmtSize(f.total)}` : ""));
    setClass(r.el, `tfile ${f.state === "running" ? "active" : ""} ${f.state === "failed" ? "bad" : ""}`.trim());
    return r;
  }

  function renderFiles(c, t) {
    const files = hideDone ? t.files.filter((f) => !["done", "skipped"].includes(f.state)) : t.files;
    const keep = new Set(files.map((f) => f.id));
    // 사라진 행 제거
    for (const [fid, r] of c.rows) if (!keep.has(fid)) { r.el.remove(); c.rows.delete(fid); }
    // 순서대로 배치 (이미 제자리에 있으면 DOM 을 건드리지 않음 → 스크롤 유지)
    let prev = null;
    for (const f of files) {
      const r = fileRow(c, f);
      const expected = prev ? prev.nextSibling : c.filesList.firstChild;
      if (expected !== r.el) c.filesList.insertBefore(r.el, expected);
      prev = r.el;
    }
    const doneCount = t.files.filter((f) => ["done", "skipped"].includes(f.state)).length;
    setText(c.filesInfo, `파일 ${t.files.length}개 · 완료 ${doneCount}개` + (hideDone && doneCount ? " (완료 숨김)" : ""));
    c.jump.hidden = !t.files.some((f) => f.state === "running");
    if (!files.length) {
      if (!c.emptyNote) c.emptyNote = h("div", { class: "muted small", style: { padding: "10px 12px" } }, "표시할 파일이 없습니다.");
      if (!c.emptyNote.isConnected) c.filesList.append(c.emptyNote);
    } else if (c.emptyNote && c.emptyNote.isConnected) c.emptyNote.remove();
  }

  function jumpToActive(c) {
    const row = c.filesList.querySelector(".tfile.active") || c.filesList.querySelector(".tfile.bad");
    if (row) c.filesList.scrollTop = Math.max(0, row.offsetTop - 8);
  }

  function updateCard(c, t) {
    c.t = t;
    const [label, tone] = STATUS[t.status] || [t.status, ""];
    const pct = t.total ? Math.min(100, (t.done / t.total) * 100) : (t.status === "done" ? 100 : 0);
    const remaining = t.speed > 0 && t.total ? fmtDur((t.total - t.done) / t.speed) : "";
    setClass(c.statusTag, `tag ${tone}`); setText(c.statusTag, label);
    setText(c.kindTag, kindLabel(t));
    const acct = t.meta && t.meta.account;
    c.acctTag.hidden = !acct || !state.info || state.info.accounts.length < 2;
    if (acct) { setText(c.acctTag, acct); c.acctTag.title = "이 작업은 이 계정으로 실행됩니다"; }
    const showPhase = !!t.phase && ["running", "failed", "stopped", "interrupted"].includes(t.status);
    c.phase.hidden = !showPhase;
    if (showPhase) setText(c.phase, (t.status === "running" ? "" : "멈춘 단계: ") + t.phase);
    setText(c.title, t.title); if (c.title.title !== t.title) c.title.title = t.title;
    renderActions(c, t);
    setClass(c.lane, `lane ${t.status}`); setWidth(c.laneFill, pct);
    const parts = [
      t.total ? `${fmtSize(t.done)} / ${fmtSize(t.total)} (${pct.toFixed(1)}%)` : (t.status === "running" ? "파일 목록 확인 중" : ""),
      t.status === "running" && t.speed ? `${fmtSize(t.speed)}/s` : "",
      remaining ? `남은 시간 ${remaining}` : "",
      t.count ? `파일 ${t.count_done}/${t.count}` : "",
      `시작 ${fmtTime(t.started_at || t.created_at)}`,
      t.finished_at && t.started_at ? `소요 ${fmtDur(t.finished_at - t.started_at)}` : "",
      t.summary || "",
    ].filter(Boolean);
    // 메타 정보는 span 개수를 맞춘 뒤 글자만 바꾼다
    while (c.meta.children.length < parts.length) c.meta.append(h("span"));
    while (c.meta.children.length > parts.length) c.meta.lastChild.remove();
    parts.forEach((p, i) => setText(c.meta.children[i], p));
    const isOpen = open.has(t.id);
    c.toggle.hidden = !t.files.length;
    setText(c.toggle, isOpen ? "파일 접기" : `파일 보기 (${t.files.length})`);
    const showErr = !!(t.error && t.status !== "done");
    c.err.hidden = !showErr; if (showErr) setText(c.err, t.error);
    c.filesWrap.hidden = !(isOpen && t.files.length);
    if (isOpen && t.files.length) renderFiles(c, t);
  }

  function render(tasks) {
    lastTasks = tasks;
    FILTERS.forEach(([k, l], i) => { setClass(segBtns[i], filter === k ? "active" : ""); setText(segBtns[i], `${l} ${tasks.filter((t) => match(t, k)).length}`); });
    const running = tasks.filter((t) => t.status === "running");
    const speed = running.reduce((a, t) => a + t.speed, 0);
    setText(sumRunning, running.length);
    setText(sumRunningLabel, `진행 중 (동시 ${state.info ? state.info.max_concurrent_tasks : 1}개)`);
    setText(sumQueued, tasks.filter((t) => t.status === "queued").length);
    setText(sumSpeed, speed ? fmtSize(speed) + "/s" : "—");

    const shown = tasks.filter((t) => match(t, filter));
    const ids = new Set(shown.map((t) => t.id));
    for (const [id, c] of cards) if (!ids.has(id)) { c.el.remove(); cards.delete(id); }
    let prev = null;
    for (const t of shown) {
      let c = cards.get(t.id);
      if (!c) { c = createCard(t); cards.set(t.id, c); }
      updateCard(c, t);
      const expected = prev ? prev.nextSibling : listEl.firstChild;
      if (expected !== c.el) listEl.insertBefore(c.el, expected);
      prev = c.el;
    }
    emptyEl.hidden = shown.length > 0;
    if (!shown.length) setText(emptyEl.firstChild, tasks.length ? "이 조건에 맞는 작업이 없습니다" : "아직 전송 작업이 없습니다");
    if (emptyEl !== listEl.lastChild) listEl.append(emptyEl);
  }
  function rerender() { render(lastTasks); }

  async function tick() {
    if (document.hidden) return;   // 탭이 안 보이면 쉬기
    try {
      const r = await GET("/api/tasks");
      trackTaskStatus(r.tasks);
      if (r.running !== state.running) { state.running = r.running; renderNav("tasks"); }
      render(r.tasks);
    } catch { /* 무시 */ }
  }
  const onVisible = () => { if (!document.hidden) tick(); };
  document.addEventListener("visibilitychange", onVisible);
  state.cleanup = () => document.removeEventListener("visibilitychange", onVisible);
  tick();
  state.timers.push(setInterval(tick, 1500));
};

function openLocal(abs) {
  const info = state.info;
  const root = abs.startsWith(info.upload_dir) ? "uploads" : "downloads";
  const base = root === "uploads" ? info.upload_dir : info.download_dir;
  go("local", { root, path: abs.slice(base.length).replace(/^\//, "") });
}

async function logDialog(id) {
  const pre = h("pre", { class: "output wrap", style: { maxHeight: "65vh" } }, "불러오는 중…");
  let timer;
  const load = async () => {
    try {
      const t = await GET(`/api/tasks/${id}`);
      const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 20;
      pre.textContent = t.log.join("\n");
      if (atBottom) pre.scrollTop = pre.scrollHeight;
      if (!["running", "queued"].includes(t.status)) clearInterval(timer);
    } catch { clearInterval(timer); }
  };
  await load();
  pre.scrollTop = pre.scrollHeight;
  timer = setInterval(load, 1500);
  await modal({ title: "작업 로그", wide: true, body: pre, onClose: () => clearInterval(timer),
    actions: [{ label: "복사", onClick: () => { copyText(pre.textContent); return false; } }, { label: "닫기", kind: "primary" }] });
}

// =================================================================== NAS 파일
PAGES.local = (view, params) => {
  const st = { root: params.get("root") || store.get("localRoot", "downloads"), path: params.get("path") || "", items: [], selected: new Set(), data: null };
  const uploadDest = params.get("dest");
  if (uploadDest) st.root = params.get("root") || "uploads";
  const seg = h("div", { class: "seg" });
  const crumbs = h("div", { class: "crumbs" });
  const selbar = h("div", { class: "selbar", hidden: true });
  const listWrap = h("div");
  const foot = h("div", { class: "list-foot" });
  const fileInput = h("input", { type: "file", multiple: true, hidden: true, onchange: () => uploadFiles([...fileInput.files].map((f) => [f, f.name])) });
  const dirInput = h("input", { type: "file", multiple: true, hidden: true, webkitdirectory: true, onchange: () => uploadFiles([...dirInput.files].map((f) => [f, f.webkitRelativePath || f.name])) });
  const upStatus = h("div", { class: "small", hidden: true });
  const drop = h("div", { class: "dropzone" },
    h("div", null, h("strong", null, "PC 의 파일을 여기에 끌어다 놓으세요"), " — NAS 의 현재 폴더로 올라갑니다."),
    h("div", { class: "row", style: { justifyContent: "center", marginTop: "10px" } },
      h("button", { class: "btn sm", onclick: () => fileInput.click() }, "파일 선택"),
      h("button", { class: "btn sm", onclick: () => dirInput.click() }, "폴더 선택")),
    upStatus, fileInput, dirInput);
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", async (e) => {
    const entries = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    const out = [];
    const walk = (entry, prefix) => new Promise((res) => {
      if (entry.isFile) entry.file((f) => { out.push([f, prefix + f.name]); res(); }, () => res());
      else if (entry.isDirectory) {
        const reader = entry.createReader(); const all = [];
        const read = () => reader.readEntries(async (ents) => {
          if (!ents.length) { for (const en of all) await walk(en, prefix + entry.name + "/"); res(); }
          else { all.push(...ents); read(); }
        }, () => res());
        read();
      } else res();
    });
    if (entries.length) { for (const en of entries) await walk(en, ""); }
    else out.push(...[...e.dataTransfer.files].map((f) => [f, f.name]));
    uploadFiles(out);
  });

  view.append(
    uploadDest ? h("div", { class: "notice info" }, "넷디스크 ", h("strong", null, uploadDest), " 로 올릴 NAS 파일을 선택한 뒤 “넷디스크로 업로드” 를 누르세요.") : null,
    h("div", { class: "panel" },
      h("div", { class: "toolbar" }, seg,
        h("button", { class: "icon-btn", title: "상위 폴더", onclick: () => nav(st.root, parentPath("/" + st.path).slice(1)) }, icon("up")),
        crumbs,
        h("button", { class: "icon-btn", title: "새로고침", onclick: () => load() }, icon("refresh")),
        h("button", { class: "icon-btn", title: "새 폴더", onclick: async () => {
          const name = await promptBox("새 폴더", "폴더 이름", "", { ok: "만들기" });
          if (!name) return;
          await POST("/api/local/mkdir", { root: st.root, path: (st.path ? st.path + "/" : "") + name }); load();
        } }, icon("folderPlus"))),
      drop, selbar, listWrap, foot));

  function nav(root, path) { st.root = root; st.path = path; st.selected.clear(); store.set("localRoot", root); load(); }

  function render() {
    seg.replaceChildren(...[["downloads", "다운로드 폴더"], ["uploads", "업로드 폴더"]].map(([k, l]) =>
      h("button", { class: st.root === k ? "active" : "", onclick: () => nav(k, "") }, l)));
    const parts = st.path ? st.path.split("/") : [];
    const hostBase = st.root === "downloads" ? state.info.host_download_dir : state.info.host_upload_dir;
    crumbs.replaceChildren(h("button", { onclick: () => nav(st.root, ""), title: st.data ? st.data.base : "" }, hostBase || (st.data ? st.data.base : "")),
      ...parts.flatMap((p, i) => [h("span", { class: "sep" }, "/"), h("button", { onclick: () => nav(st.root, parts.slice(0, i + 1).join("/")) }, p)]));
    const n = st.selected.size;
    selbar.hidden = !n;
    if (n) {
      const sel = st.items.filter((i) => st.selected.has(i.abs));
      selbar.replaceChildren(h("strong", null, `${n}개 선택`),
        h("button", { class: "btn sm primary", onclick: () => uploadToPan(sel.map((i) => i.abs)) }, icon("upload"), "넷디스크로 업로드"),
        sel.length === 1 && !sel[0].is_dir ? h("a", { class: "btn sm", href: "/api/local/file?" + qs({ path: sel[0].abs }) }, icon("download"), "PC 로 받기") : null,
        h("button", { class: "btn sm danger", onclick: () => del(sel.map((i) => i.abs)) }, "삭제"),
        h("span", { class: "spacer" }), h("button", { class: "btn sm ghost", onclick: () => { st.selected.clear(); render(); } }, "선택 해제"));
    }
    if (!st.items.length) {
      listWrap.replaceChildren(h("div", { class: "empty" }, h("h3", null, "빈 폴더입니다"), h("p", null, st.root === "downloads" ? "넷디스크에서 받은 파일이 여기에 저장됩니다." : "위 영역으로 파일을 올리거나, DSM 에서 이 폴더에 직접 복사하세요.")));
    } else {
      const headCheck = h("input", { type: "checkbox", checked: st.items.every((i) => st.selected.has(i.abs)), onchange: () => { st.items.forEach((i) => headCheck.checked ? st.selected.add(i.abs) : st.selected.delete(i.abs)); render(); } });
      listWrap.replaceChildren(h("div", { style: { overflowX: "auto" } }, h("table", { class: "ftable" },
        h("thead", null, h("tr", null, h("th", { class: "c-check" }, headCheck), h("th", null, "이름"), h("th", { class: "c-size" }, "크기"), h("th", { class: "c-time" }, "수정한 날짜"), h("th", { class: "c-act" }))),
        h("tbody", null, st.items.map((it) => {
          const cb = h("input", { type: "checkbox", checked: st.selected.has(it.abs), onchange: () => { cb.checked ? st.selected.add(it.abs) : st.selected.delete(it.abs); render(); } });
          return h("tr", { class: st.selected.has(it.abs) ? "selected" : "", ondblclick: () => it.is_dir && nav(st.root, it.rel) },
            h("td", { class: "c-check" }, cb),
            h("td", null, h("div", { class: "fname" }, fileIcon(it.name, it.is_dir), it.is_dir ? h("a", { onclick: () => nav(st.root, it.rel) }, it.name) : h("span", { class: "n" }, it.name))),
            h("td", { class: "c-size" }, it.is_dir ? h("span", { class: "muted" }, "—") : fmtSize(it.size)),
            h("td", { class: "c-time" }, it.mtime),
            h("td", { class: "c-act" }, h("div", { class: "row-actions" },
              h("button", { class: "icon-btn plain", title: "넷디스크로 업로드", onclick: () => uploadToPan([it.abs]) }, icon("upload")),
              !it.is_dir ? h("a", { class: "icon-btn plain", title: "PC 로 받기", href: "/api/local/file?" + qs({ path: it.abs }) }, icon("download")) : null,
              h("button", { class: "icon-btn plain", title: "삭제", onclick: () => del([it.abs]) }, icon("trash")))));
        })))));
    }
    if (st.data) {
      const d = st.data.disk;
      foot.replaceChildren(h("span", null, `항목 ${st.items.length}개`), h("span", { class: "spacer" }),
        h("span", null, `NAS 여유 공간 ${fmtSize(d.free)} / ${fmtSize(d.total)}`));
    }
  }

  async function load() {
    listWrap.replaceChildren(h("div", { class: "loading" }, "불러오는 중"));
    try {
      const d = await GET("/api/local/list?" + qs({ root: st.root, path: st.path }));
      st.data = d; st.items = d.items; st.path = d.path;
      render();
    } catch (e) { listWrap.replaceChildren(h("div", { class: "notice err", style: { margin: "14px" } }, e.message)); }
  }

  async function del(paths) {
    if (!await confirmBox("NAS 파일 삭제", `${paths.length}개 항목을 NAS 에서 완전히 삭제할까요? 되돌릴 수 없습니다.`, { danger: true, ok: "삭제" })) return;
    await POST("/api/local/delete", { paths });
    paths.forEach((p) => st.selected.delete(p)); toast("삭제했습니다.", "ok"); load();
  }

  function uploadFiles(pairs) {
    if (!pairs.length) return;
    const fd = new FormData();
    fd.append("root", st.root); fd.append("path", st.path);
    let total = 0;
    pairs.forEach(([f, name]) => { fd.append("files", f, name); total += f.size; });
    upStatus.hidden = false;
    const bar = h("i");
    upStatus.replaceChildren(h("div", null, `${pairs.length}개 파일 (${fmtSize(total)}) 올리는 중…`), h("div", { class: "upbar" }, bar));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/local/upload");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) bar.style.width = ((e.loaded / e.total) * 100).toFixed(1) + "%"; };
    xhr.onload = () => {
      upStatus.hidden = true; fileInput.value = ""; dirInput.value = "";
      if (xhr.status === 200) { toast(`${pairs.length}개 파일을 NAS 에 올렸습니다.`, "ok"); load(); }
      else toast("업로드 실패: " + xhr.status, "err");
    };
    xhr.onerror = () => { upStatus.hidden = true; toast("업로드 중 연결이 끊겼습니다.", "err"); };
    xhr.send(fd);
  }

  async function uploadToPan(paths) {
    const o = { norapid: false, policy: "", threads: 0, load: 0, retry: 3, ...store.get("ulopts", {}) };
    const dest = h("input", { class: "input", value: uploadDest || store.get("ulDest", store.get("lastPath", "/")) });
    const policy = h("select", { class: "input", onchange: (e) => { o.policy = e.target.value; } },
      [["", "설정값 따름"], ["skip", "건너뛰기"], ["overwrite", "덮어쓰기"], ["rsync", "크기가 다를 때만 덮어쓰기"]].map(([v, l]) => h("option", { value: v, selected: o.policy === v }, l)));
    const num = (k, label) => h("div", { class: "field" }, h("label", null, label), h("input", { class: "input", type: "number", min: 0, value: o[k], oninput: (e) => { o[k] = parseInt(e.target.value || "0", 10); } }));
    const res = await modal({ title: `넷디스크로 업로드 (${paths.length}개)`, body: [
      h("div", { class: "mono muted", style: { maxHeight: "80px", overflow: "auto", marginBottom: "14px" } }, paths.map((p) => h("div", null, p))),
      h("div", { class: "field" }, h("label", null, "넷디스크 폴더"), h("div", { class: "input-row" }, dest,
        h("button", { class: "btn", type: "button", onclick: async () => { const p = await pickRemoteFolder(dest.value); if (p) dest.value = p; } }, "찾아보기"))),
      h("div", { class: "field" }, h("label", null, "같은 이름 파일이 있으면"), policy),
      h("details", { class: "adv" }, h("summary", null, "고급 옵션"),
        h("div", { class: "num-grid" }, num("threads", "파일당 스레드 (-p)"), num("load", "동시 파일 수 (-l)"), num("retry", "재시도 횟수")),
        h("label", { class: "check", style: { marginBottom: "14px" } }, h("input", { type: "checkbox", checked: o.norapid, onchange: (e) => { o.norapid = e.target.checked; } }),
          h("span", null, "빠른 업로드(秒传) 건너뛰기", h("small", null, "같은 파일이 바이두에 이미 있어도 실제로 업로드합니다")))),
      h("p", { class: "help", style: { margin: 0 } }, "폴더를 고르면 안의 파일을 모두 올립니다. 업로드는 이어올리기를 지원하지 않습니다."),
    ], actions: [{ label: "취소" }, { label: "업로드 시작", kind: "primary", onClick: () => {
      store.set("ulopts", o); store.set("ulDest", dest.value.trim());
      return POST("/api/tasks/upload", { local_paths: paths, dest: dest.value.trim() || "/", options: o });
    } }] });
    if (res && res.ok) { toast("업로드 작업을 추가했습니다.", "ok"); st.selected.clear(); render(); }
  }

  load();
};

// =================================================================== 공유 링크 저장 (transfer)
function parseShareText(text) {
  // "链接: https://pan.baidu.com/s/xxx 提取码: abcd", "...?pwd=abcd", "https://pan.baidu.com/s/xxx abcd" 등을 모두 인식
  const out = [];
  const re = /(https?:\/\/(?:pan|yun)\.baidu\.com\/(?:s\/[\w-]+|share\/init\?surl=[\w-]+)(?:\?pwd=(\w{4}))?)/g;
  let m;
  const matches = [];
  while ((m = re.exec(text))) matches.push({ link: m[1], pwd: m[2] || "", end: re.lastIndex });
  matches.forEach((mm, i) => {
    let code = mm.pwd;
    if (!code) {
      const tail = text.slice(mm.end, i + 1 < matches.length ? text.indexOf(matches[i + 1].link, mm.end) : undefined);
      const c = tail.match(/(?:提取码|提取碼|密码|密碼|pwd|code|코드|비밀번호)\s*[:：=]?\s*([A-Za-z0-9]{4})\b/i) || tail.match(/^\s+([A-Za-z0-9]{4})\b/);
      if (c) code = c[1];
    }
    out.push({ link: mm.link.replace(/\?pwd=\w+$/, ""), code });
  });
  return out;
}

PAGES.transfer = (view, params) => {
  if (!requireLogin(view)) return;
  const text = h("textarea", { class: "input", rows: 5, placeholder: "공유 문구를 그대로 붙여넣으세요.\n예) 链接: https://pan.baidu.com/s/1AbCdEf 提取码: x7k2\n예) https://pan.baidu.com/s/1AbCdEf?pwd=x7k2\n여러 개를 한 번에 붙여넣어도 됩니다.", oninput: detect });
  const detected = h("div", { class: "small" });
  const dest = h("input", { class: "input", value: params.get("dest") || store.get("transferDest", store.get("lastPath", "/")) });
  const saveto = h("input", { class: "input", value: store.get("dlSaveto", state.info.download_dir), onchange: () => loadSpace() });
  const o = { mode: "save", collect: false, rname: false, purge: true, ...store.get("transferOpts", {}) };
  delete o.download;
  const chk = (k, label, sub) => h("label", { class: "check" }, h("input", { type: "checkbox", checked: o[k], onchange: (e) => { o[k] = e.target.checked; } }), h("span", null, label, sub && h("small", null, sub)));
  const fsid = h("input", { class: "input", placeholder: "선택 사항" });
  const out = h("pre", { class: "output wrap" });
  const hintBox = h("div");
  const spaceBox = h("div", { class: "space-box" });
  let found = [];

  const MODES = [
    ["save", "넷디스크에만 저장", "공유 파일을 내 넷디스크 폴더에 저장합니다."],
    ["download", "저장 후 NAS 로 받기", "넷디스크에 저장한 뒤 NAS 로 다운로드합니다. 넷디스크에도 남습니다."],
    ["relay", "받고 넷디스크에서 삭제 (경유)", "넷디스크 임시 폴더에 저장 → NAS 로 다운로드 → 넷디스크와 휴지통에서 삭제. 무료 용량이 작아도 계속 받을 수 있습니다."],
  ];
  const modeSeg = h("div", { class: "seg mode-seg" });
  const modeHelp = h("p", { class: "help", style: { margin: "6px 0 0" } });
  const destField = h("div", { class: "field" }, h("label", null, "저장할 넷디스크 폴더"), h("div", { class: "input-row" }, dest,
    h("button", { class: "btn", onclick: async () => { const p = await pickRemoteFolder(dest.value); if (p) dest.value = p; } }, "찾아보기")));
  const savetoField = h("div", { class: "field" }, h("label", null, "NAS 저장 위치"), h("div", { class: "input-row" }, saveto,
    h("button", { class: "btn", onclick: async () => { const p = await pickLocalFolder(saveto.value); if (p) { saveto.value = p; loadSpace(); } } }, "찾아보기")),
    h("p", { class: "help" }, "다운로드 옵션(스레드, 덮어쓰기 등)은 마지막으로 쓴 다운로드 설정을 따릅니다."));
  const purgeChk = chk("purge", "휴지통에서도 삭제", "이 작업이 만든 임시 폴더만 휴지통에서 지웁니다. 다른 파일은 건드리지 않습니다.");
  const runBtn = h("button", { class: "btn primary" });

  function renderMode() {
    modeSeg.replaceChildren(...MODES.map(([k, l]) => h("button", { class: o.mode === k ? "active" : "", onclick: () => { o.mode = k; renderMode(); } }, l)));
    modeHelp.textContent = MODES.find((m) => m[0] === o.mode)[2];
    destField.hidden = o.mode === "relay";
    savetoField.hidden = o.mode === "save";
    purgeChk.hidden = o.mode !== "relay";
    runBtn.textContent = o.mode === "save" ? "넷디스크에 저장" : "전송 작업 추가";
    loadSpace();
  }

  async function loadSpace() {
    const parts = [];
    const q = state.quota;
    if (q) {
      const left = q.total - q.used;
      parts.push(h("div", { class: "space-row" }, h("span", null, "넷디스크 남은 용량"), h("strong", { class: left < 2 * 1024 ** 3 ? "warn-text" : "" }, fmtSize(left))));
    }
    if (o.mode !== "save") {
      try {
        const d = await GET("/api/local/disk?" + qs({ path: saveto.value.trim() }));
        parts.push(h("div", { class: "space-row" }, h("span", null, "NAS 여유 공간"), h("strong", { class: d.free < d.min_free * 2 ? "warn-text" : "" }, fmtSize(d.free))));
      } catch { /* 경로 오류는 실행 때 알려줌 */ }
    }
    parts.push(h("p", { class: "help", style: { margin: "6px 0 0" } }, o.mode === "save"
      ? "공유 파일의 크기는 저장하기 전에는 알 수 없습니다. 남은 용량보다 크면 저장이 실패합니다."
      : "넷디스크에 저장한 뒤 실제 크기를 확인해서, NAS 공간이 모자라면 다운로드를 시작하지 않고 알려줍니다. 받는 중에도 NAS 여유 공간이 기준 아래로 떨어지면 자동으로 멈춥니다."));
    spaceBox.replaceChildren(...parts);
  }

  function detect() {
    found = parseShareText(text.value);
    detected.replaceChildren(...(found.length ? found.map((f) => h("div", { class: "row", style: { padding: "3px 0" } },
      h("span", { class: "tag ok" }, "인식"), h("span", { class: "mono" }, f.link), f.code ? h("span", { class: "tag accent" }, "코드 " + f.code) : h("span", { class: "tag warn" }, "코드 없음"))) :
      text.value.trim() ? [h("span", { class: "tag danger" }, "pan.baidu.com 공유 링크를 찾지 못했습니다")] : []));
  }

  runBtn.addEventListener("click", () => busy(runBtn, async () => {
    if (!found.length) return toast("공유 링크를 붙여넣으세요.", "err");
    store.set("transferOpts", o); store.set("transferDest", dest.value.trim());
    if (o.mode !== "save") store.set("dlSaveto", saveto.value.trim());
    out.textContent = ""; hintBox.replaceChildren();
    const options = { ...DL_DEFAULTS, ...store.get("dlopts", {}) };
    delete options.separate;
    let added = 0;
    for (const f of found) {
      out.textContent += `▶ ${f.link}${f.code ? " (" + f.code + ")" : ""}\n`;
      try {
        const r = await POST("/api/transfer", { link: f.link, code: f.code, dest: dest.value.trim() || "/", mode: o.mode,
          collect: o.collect, rname: o.rname, fs_id: fsid.value.trim(), saveto: saveto.value.trim(), purge_recycle: o.purge, options });
        out.textContent += (r.output || "") + "\n\n";
        if (r.task) added++;
        if (r.hint) hintBox.replaceChildren(h("div", { class: "notice err", style: { marginTop: "12px" } }, r.hint));
      } catch (e) { out.textContent += "실패: " + e.message + "\n\n"; }
    }
    if (o.mode === "save") { toast("저장을 마쳤습니다.", "ok"); refreshQuota().then(loadSpace); }
    else if (added) {
      toast(`${added}개 작업을 전송 현황에 추가했습니다.`, "ok");
      hintBox.replaceChildren(h("div", { class: "row", style: { marginTop: "12px" } }, h("a", { class: "btn", href: "#/tasks" }, "전송 현황 보기")));
      state.running = Math.max(state.running, 1); renderNav("transfer");
    }
  }));

  view.append(h("div", { class: "grid-2" },
    h("div", { class: "panel" },
      h("div", { class: "panel-head" }, h("h2", null, "공유 링크 저장"), h("span", { class: "sub" }, "转存")),
      h("div", { class: "panel-body" },
        h("div", { class: "field" }, h("label", null, "공유 링크"), text, detected),
        h("div", { class: "field" }, h("label", null, "방식"), modeSeg, modeHelp),
        destField, savetoField,
        h("div", { class: "checks" },
          purgeChk,
          chk("collect", "여러 파일을 한 폴더로 묶기"),
          chk("rname", "파일명 앞 4자리 무작위 변경", "빠른 저장 성공률을 높일 때")),
        h("details", { class: "adv" }, h("summary", null, "특정 파일만 저장 (fs_id)"),
          h("div", { class: "field" }, fsid, h("p", { class: "help" }, "파일이 아주 많은 공유 폴더에서 일부만 저장할 때 씁니다."))),
        h("div", { class: "row" }, runBtn, h("a", { class: "btn ghost", href: "#/files", onclick: (e) => { e.currentTarget.href = "#/files?" + qs({ path: dest.value }); } }, "저장 폴더 열기")))),
    h("div", null,
      h("div", { class: "panel" }, h("div", { class: "panel-head" }, h("h2", null, "공간")), h("div", { class: "panel-body" }, spaceBox)),
      h("div", { class: "panel" },
        h("div", { class: "panel-head" }, h("h2", null, "결과")),
        h("div", { class: "panel-body" }, out, hintBox,
          h("div", { class: "notice info", style: { marginTop: "14px", marginBottom: 0 } },
            "링크 저장에는 로그인할 때 STOKEN 이 필요합니다. 오류가 나면 계정 화면에서 STOKEN 이 포함된 Cookies 로 다시 로그인하세요."))))));
  detect();
  renderMode();
};

// =================================================================== 오프라인 다운로드
PAGES.offline = (view, params) => {
  if (!requireLogin(view)) return;
  const urls = h("textarea", { class: "input", rows: 5, placeholder: "한 줄에 하나씩\nhttp/https/ftp 주소, 磁力(magnet:?xt=...), ed2k:// 링크" });
  const path = h("input", { class: "input", value: params.get("path") || store.get("offlinePath", "/") });
  const addOut = h("pre", { class: "output wrap", hidden: true });
  const listEl = h("div");
  const selected = new Set();

  const addBtn = h("button", { class: "btn primary", onclick: () => busy(addBtn, async () => {
    const list = urls.value.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    if (!list.length) return toast("주소를 입력하세요.", "err");
    store.set("offlinePath", path.value.trim());
    const r = await POST("/api/offline/add", { path: path.value.trim() || "/", urls: list });
    addOut.hidden = false; addOut.textContent = r.output;
    if (r.ok) { urls.value = ""; toast("오프라인 작업을 추가했습니다.", "ok"); }
    load();
  }) }, "작업 추가");

  async function act(action, ids, all = false) {
    if ((action === "delete" || action === "cancel") && !await confirmBox(action === "delete" ? "기록 삭제" : "작업 취소",
      all ? "오프라인 다운로드 기록을 모두 지울까요? 확인 없이 바로 지워집니다." : `${ids.length}개 작업을 ${action === "delete" ? "기록에서 지울" : "취소할"}까요?`, { danger: true })) return;
    const r = await POST(`/api/offline/${action}`, { ids, all });
    action === "query" ? showOutput("작업 조회", r.output) : toast(r.output.split("\n")[0] || "완료", r.ok ? "ok" : "err");
    selected.clear(); load();
  }

  let lastR = null;
  async function load(cached) {
    if (!cached || !lastR) listEl.replaceChildren(h("div", { class: "loading" }, "목록을 불러오는 중"));
    const r = cached && lastR ? lastR : (lastR = await GET("/api/offline/list"));
    if (!r.items.length) {
      listEl.replaceChildren(r.output && !/任务ID/.test(r.output) && r.output.trim() ? h("pre", { class: "output wrap", style: { margin: "14px" } }, r.output) :
        h("div", { class: "empty" }, h("h3", null, "오프라인 작업이 없습니다"), h("p", null, "바이두 서버가 대신 받아 넷디스크에 저장합니다. 동시에 진행할 수 있는 작업 수에 제한이 있습니다.")));
      return;
    }
    const bar = h("div", { class: "selbar", hidden: !selected.size },
      h("strong", null, `${selected.size}개 선택`),
      h("button", { class: "btn sm", onclick: () => act("query", [...selected]) }, "조회"),
      h("button", { class: "btn sm", onclick: () => act("cancel", [...selected]) }, "취소"),
      h("button", { class: "btn sm danger", onclick: () => act("delete", [...selected]) }, "기록 삭제"));
    listEl.replaceChildren(bar, h("div", { style: { overflowX: "auto" } }, h("table", { class: "ftable" },
      h("thead", null, h("tr", null, h("th", { class: "c-check" }), h("th", null, "작업"), h("th", { class: "c-size" }, "크기"), h("th", null, "상태"), h("th", { class: "c-time" }, "만든 날짜"), h("th", { class: "c-act" }))),
      h("tbody", null, r.items.map((t) => h("tr", null,
        h("td", { class: "c-check" }, h("input", { type: "checkbox", checked: selected.has(t.task_id), onchange: (e) => { e.target.checked ? selected.add(t.task_id) : selected.delete(t.task_id); load(true); } })),
        h("td", null, h("div", { class: "fname" }, h("div", { style: { minWidth: 0 } }, h("span", { class: "n", style: { fontWeight: 500 } }, t.name || "(이름 없음)"),
          h("span", { class: "sub" }, `#${t.task_id} · ${t.save_path} · ${t.url}`)))),
        h("td", { class: "c-size" }, t.size_text),
        h("td", null, h("span", { class: `tag ${t.tone}` }, t.status_label)),
        h("td", { class: "c-time" }, t.created),
        h("td", { class: "c-act" }, h("button", { class: "icon-btn plain", title: "더 보기", onclick: (e) => popMenu(e.currentTarget, [
          { label: "넷디스크에서 열기", onClick: () => go("files", { path: t.save_path }) },
          { label: "NAS 로 다운로드", onClick: () => downloadDialog([t.save_path + "/" + t.name]) },
          { label: "상세 조회", onClick: () => act("query", [t.task_id]) },
          { label: "주소 복사", onClick: () => copyText(t.url) },
          "-",
          { label: "작업 취소", onClick: () => act("cancel", [t.task_id]) },
          { label: "기록 삭제", danger: true, onClick: () => act("delete", [t.task_id]) },
        ]) }, icon("more")))))))));
  }

  view.append(h("div", { class: "grid-2" },
    h("div", { class: "panel" }, h("div", { class: "panel-head" }, h("h2", null, "새 작업")),
      h("div", { class: "panel-body" },
        h("div", { class: "field" }, h("label", null, "주소"), urls),
        h("div", { class: "field" }, h("label", null, "저장할 넷디스크 폴더"), h("div", { class: "input-row" }, path,
          h("button", { class: "btn", onclick: async () => { const p = await pickRemoteFolder(path.value); if (p) path.value = p; } }, "찾아보기"))),
        addBtn, addOut))),
  h("div", { class: "panel" }, h("div", { class: "panel-head" }, h("h2", null, "작업 목록"), h("span", { class: "spacer" }),
    h("button", { class: "btn sm", onclick: () => load() }, icon("refresh"), "새로고침"),
    h("button", { class: "btn sm danger", onclick: () => act("delete", [], true) }, "기록 모두 지우기")), listEl));
  load();
  state.timers.push(setInterval(() => { if (!$(".menu") && !$(".modal-back")) load(); }, 20000));
};

// =================================================================== 내 공유
PAGES.share = (view) => {
  if (!requireLogin(view)) return;
  let page = 1;
  const selected = new Set();
  const listEl = h("div");
  const pager = h("div", { class: "row" });

  async function cancel(ids) {
    if (!await confirmBox("공유 취소", `${ids.length}개 공유를 취소할까요? 링크가 더 이상 열리지 않습니다.`, { danger: true, ok: "공유 취소" })) return;
    const r = await POST("/api/share/cancel", { ids });
    toast(r.output, r.ok ? "ok" : "err"); selected.clear(); load();
  }
  let lastR = null;
  async function load(cached) {
    if (!cached || !lastR) listEl.replaceChildren(h("div", { class: "loading" }, "불러오는 중"));
    const r = cached && lastR ? lastR : (lastR = await GET("/api/share/list?" + qs({ page })));
    pager.replaceChildren(
      h("button", { class: "btn sm", disabled: page <= 1, onclick: () => { page--; load(); } }, "이전"),
      h("span", { class: "muted small" }, `${page} 페이지`),
      h("button", { class: "btn sm", disabled: r.items.length === 0, onclick: () => { page++; load(); } }, "다음"));
    if (!r.items.length) {
      listEl.replaceChildren(r.output && /失败|错误/.test(r.output) ? h("pre", { class: "output wrap", style: { margin: "14px" } }, r.output) :
        h("div", { class: "empty" }, h("h3", null, "공유한 항목이 없습니다"), h("p", null, "내 넷디스크에서 파일 메뉴의 “공유 링크 만들기” 로 공유할 수 있습니다."),
          h("a", { class: "btn", href: "#/files" }, "내 넷디스크 열기")));
      return;
    }
    listEl.replaceChildren(
      h("div", { class: "selbar", hidden: !selected.size }, h("strong", null, `${selected.size}개 선택`),
        h("button", { class: "btn sm danger", onclick: () => cancel([...selected]) }, "공유 취소")),
      h("div", { style: { overflowX: "auto" } }, h("table", { class: "ftable" },
        h("thead", null, h("tr", null, h("th", { class: "c-check" }), h("th", null, "공유 항목"), h("th", null, "링크"), h("th", null, "기간"), h("th", { class: "c-size" }, "조회"), h("th", { class: "c-act" }))),
        h("tbody", null, r.items.map((s) => h("tr", null,
          h("td", { class: "c-check" }, h("input", { type: "checkbox", checked: selected.has(s.share_id), onchange: (e) => { e.target.checked ? selected.add(s.share_id) : selected.delete(s.share_id); load(true); } })),
          h("td", null, h("div", { class: "fname" }, fileIcon(baseName(s.path), false), h("div", { style: { minWidth: 0 } }, h("span", { class: "n" }, baseName(s.path)), h("span", { class: "sub" }, s.path)))),
          h("td", null, h("span", { class: "mono" }, s.link.replace(/^https?:\/\//, "")), s.pwd ? h("span", { class: "tag accent", style: { marginLeft: "6px" } }, s.pwd) : null),
          h("td", { class: "small" }, s.valid),
          h("td", { class: "c-size" }, s.views),
          h("td", { class: "c-act" }, h("div", { class: "row-actions" },
            h("button", { class: "icon-btn plain", title: "링크 복사", onclick: () => copyText(s.pwd ? `链接: ${s.full_link} 提取码: ${s.pwd}` : s.full_link) }, icon("copy")),
            h("button", { class: "icon-btn plain", title: "공유 취소", onclick: () => cancel([s.share_id]) }, icon("close"))))))))));
  }
  view.append(h("div", { class: "panel" }, h("div", { class: "panel-head" }, h("h2", null, "공유 중인 링크"), h("span", { class: "spacer" }), pager,
    h("button", { class: "btn sm", onclick: () => load() }, icon("refresh"), "새로고침")), listEl));
  load();
};

// =================================================================== 휴지통
PAGES.recycle = (view) => {
  if (!requireLogin(view)) return;
  let page = 1;
  const selected = new Set();
  const listEl = h("div");
  const pager = h("div", { class: "row" });

  async function act(action, ids, all = false) {
    if (action === "delete" && !await confirmBox(all ? "휴지통 비우기" : "영구 삭제",
      all ? "휴지통을 비울까요? 확인 없이 모두 영구 삭제됩니다." : `${ids.length}개 항목을 영구 삭제할까요?`, { danger: true, ok: "영구 삭제" })) return;
    const r = await POST(`/api/recycle/${action}`, { ids, all });
    toast(r.output.split("\n").filter(Boolean).pop() || "완료", r.ok ? "ok" : "err");
    selected.clear(); load(); refreshQuota();
  }
  let lastR = null;
  async function load(cached) {
    if (!cached || !lastR) listEl.replaceChildren(h("div", { class: "loading" }, "불러오는 중"));
    const r = cached && lastR ? lastR : (lastR = await GET("/api/recycle/list?" + qs({ page })));
    pager.replaceChildren(
      h("button", { class: "btn sm", disabled: page <= 1, onclick: () => { page--; load(); } }, "이전"),
      h("span", { class: "muted small" }, `${page} 페이지`),
      h("button", { class: "btn sm", disabled: r.items.length === 0, onclick: () => { page++; load(); } }, "다음"));
    if (!r.items.length) {
      listEl.replaceChildren(r.output && /失败|错误/.test(r.output) ? h("pre", { class: "output wrap", style: { margin: "14px" } }, r.output) :
        h("div", { class: "empty" }, h("h3", null, "휴지통이 비어 있습니다"), h("p", null, "삭제한 파일은 일정 기간 여기에 보관됩니다.")));
      return;
    }
    const all = r.items.every((i) => selected.has(i.fs_id));
    listEl.replaceChildren(
      h("div", { class: "selbar", hidden: !selected.size }, h("strong", null, `${selected.size}개 선택`),
        h("button", { class: "btn sm primary", onclick: () => act("restore", [...selected]) }, "되살리기"),
        h("button", { class: "btn sm danger", onclick: () => act("delete", [...selected]) }, "영구 삭제")),
      h("div", { style: { overflowX: "auto" } }, h("table", { class: "ftable" },
        h("thead", null, h("tr", null, h("th", { class: "c-check" }, h("input", { type: "checkbox", checked: all, onchange: (e) => { r.items.forEach((i) => e.target.checked ? selected.add(i.fs_id) : selected.delete(i.fs_id)); load(true); } })),
          h("th", null, "원래 위치"), h("th", { class: "c-size" }, "크기"), h("th", null, "남은 기간"), h("th", { class: "c-act" }))),
        h("tbody", null, r.items.map((f) => h("tr", null,
          h("td", { class: "c-check" }, h("input", { type: "checkbox", checked: selected.has(f.fs_id), onchange: (e) => { e.target.checked ? selected.add(f.fs_id) : selected.delete(f.fs_id); load(true); } })),
          h("td", null, h("div", { class: "fname" }, fileIcon(baseName(f.path), f.is_dir), h("div", { style: { minWidth: 0 } }, h("span", { class: "n" }, baseName(f.path)), h("span", { class: "sub" }, parentPath(f.path))))),
          h("td", { class: "c-size" }, f.is_dir ? "—" : fmtSize(f.size)),
          h("td", null, h("span", { class: `tag ${f.left_days <= 2 ? "warn" : ""}` }, `${f.left_days}일`)),
          h("td", { class: "c-act" }, h("div", { class: "row-actions" },
            h("button", { class: "btn sm", onclick: () => act("restore", [f.fs_id]) }, "되살리기")))))))));
  }
  view.append(h("div", { class: "panel" }, h("div", { class: "panel-head" }, h("h2", null, "휴지통"), h("span", { class: "spacer" }), pager,
    h("button", { class: "btn sm", onclick: () => load() }, icon("refresh"), "새로고침"),
    h("button", { class: "btn sm danger", onclick: () => act("delete", [], true) }, "휴지통 비우기")), listEl));
  load();
};

// =================================================================== 터미널
const COMMANDS = [
  ["계정", [["login -cookies=\"...\"", "Cookies 로 로그인 (권장)"], ["login -bduss=... -stoken=...", "BDUSS/STOKEN 으로 로그인"], ["login", "아이디/비밀번호 로그인 (대화형, 유지보수 중단)"],
    ["loglist", "로그인한 계정 목록"], ["who", "현재 계정"], ["su", "계정 전환 (대화형)"], ["logout", "로그아웃"], ["setastoken", "accessToken 설정"]]],
  ["탐색", [["ls -l /", "목록 (-l 상세, --size/--time/--name, --asc/--desc)"], ["tree --depth=2 /", "트리 보기"], ["cd /경로", "작업 폴더 이동 (cd -l 로 목록까지)"], ["pwd", "현재 작업 폴더"],
    ["meta /경로", "파일/폴더 정보"], ["search -r 키워드", "파일 검색 (-path=, -r 하위 포함)"], ["match /경로/*.mp4", "와일드카드 확인"], ["quota", "용량 확인"]]],
  ["파일 관리", [["mkdir /새폴더", "폴더 만들기"], ["rm /경로", "삭제 (휴지통으로)"], ["cp /원본 /대상폴더", "복사"], ["mv /원본 /대상", "이동/이름 바꾸기"]]],
  ["전송", [["download /경로", "다운로드 (--saveto, --ow, -p, -l, --mode, --retry, --fullpath, --mtime …)"], ["upload /uploads/파일 /대상폴더", "업로드 (--norapid, --policy)"],
    ["locate /파일", "다운로드 직링크"], ["transfer 링크 코드", "공유 링크 저장 (--download, --collect, --rname, --fs_id)"], ["export /경로", "내보내기 (빠른 업로드 정보)"]]],
  ["공유·오프라인·휴지통", [["share set -p=abcd --period=7 /경로", "공유 만들기"], ["share list", "공유 목록"], ["share cancel ID", "공유 취소"],
    ["offlinedl add -path=/ 주소", "오프라인 작업 추가"], ["offlinedl list", "오프라인 작업 목록"], ["offlinedl query ID", "작업 조회"], ["offlinedl cancel ID", "작업 취소"], ["offlinedl delete -all", "기록 모두 삭제"],
    ["recycle list", "휴지통 목록"], ["recycle restore fs_id", "되살리기"], ["recycle delete -all", "휴지통 비우기"]]],
  ["기타", [["config", "설정 보기"], ["config set -max_parallel=1", "설정 바꾸기"], ["env", "환경 변수"], ["tool getip", "외부 IP 확인"], ["tool showtime", "베이징 시간"],
    ["tool enc / tool dec", "파일 암호화·복호화"], ["sumfile /uploads/파일", "로컬 파일 빠른 업로드 정보"], ["update", "새 버전 확인"], ["help", "전체 도움말"]]],
];

PAGES.terminal = (view, params) => {
  let tab = params.get("tab") || store.get("termTab", "shell");
  const tabs = h("div", { class: "tabs" });
  const body = h("div");
  view.append(tabs, body);
  let term, ws, fit, ro;

  function renderTabs() {
    tabs.replaceChildren(...[["shell", "대화형 터미널"], ["run", "명령 한 번 실행"], ["ref", "명령어 모음"]].map(([k, l]) =>
      h("button", { class: `tab ${tab === k ? "active" : ""}`, onclick: () => { tab = k; store.set("termTab", k); show(); } }, l)));
  }
  function teardown() {
    if (ws) { try { ws.close(); } catch { /* 무시 */ } ws = null; }
    if (ro) { ro.disconnect(); ro = null; }
    if (term) { term.dispose(); term = null; }
  }
  state.cleanup = teardown;

  function show(prefill) {
    renderTabs();
    teardown();
    if (tab === "shell") shell();
    else if (tab === "run") runner(prefill);
    else reference();
  }

  function shell() {
    const status = h("span", null, "연결 중…");
    const dot = h("span", { class: "dot" });
    const wrap = h("div", { class: "term-wrap" });
    body.replaceChildren(h("div", { class: "term-status" }, dot, status, h("span", { class: "spacer" }),
      h("span", { class: "muted small" }, "Tab 자동완성 · ↑↓ 기록 · 화면을 떠나면 세션이 닫힙니다"),
      h("button", { class: "btn sm", onclick: () => show() }, "다시 연결")), wrap);
    if (!window.Terminal) { wrap.replaceChildren(h("div", { class: "notice err" }, "터미널 라이브러리를 불러오지 못했습니다.")); return; }
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    term = new window.Terminal({ fontFamily: '"IBM Plex Mono", Menlo, Consolas, "D2Coding", monospace', fontSize: 13.5, cursorBlink: true, scrollback: 5000,
      theme: { background: "#0B0F14", foreground: "#DCE3EA", cursor: "#7086FF", selectionBackground: dark ? "#2B3A66" : "#33437A" } });
    fit = new window.FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open(wrap);
    const doFit = () => { try { fit.fit(); } catch { /* 무시 */ } if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows })); };
    ro = new ResizeObserver(doFit); ro.observe(wrap);
    setTimeout(doFit, 50);
    ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws/terminal");
    ws.binaryType = "arraybuffer";
    ws.onopen = () => { dot.classList.add("on"); status.textContent = "연결됨 · BaiduPCS-Go 대화형 모드"; doFit(); term.focus(); };
    ws.onmessage = (e) => {
      if (typeof e.data === "string") {
        try { if (JSON.parse(e.data).type === "exit") { term.write("\r\n\x1b[90m[세션이 끝났습니다. ‘다시 연결’ 을 누르세요]\x1b[0m\r\n"); } } catch { term.write(e.data); }
      } else term.write(new Uint8Array(e.data));
    };
    ws.onclose = (e) => { dot.classList.remove("on"); status.textContent = e.code === 4401 ? "웹 UI 로그인이 필요합니다" : "연결이 끊겼습니다"; };
    term.onData((d) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "input", data: d })); });
  }

  function runner(prefill) {
    const hist = store.get("cmdHistory", []);
    const input = h("input", { class: "input mono", placeholder: "예) ls -l /    tree --depth=1 /    quota", value: prefill || "", style: { fontSize: "13.5px" },
      onkeydown: (e) => {
        if (e.key === "Enter") { e.preventDefault(); runBtn.click(); }
        if (e.key === "ArrowUp" && hist.length) { e.preventDefault(); hi = Math.min(hist.length - 1, hi + 1); input.value = hist[hi]; }
        if (e.key === "ArrowDown") { e.preventDefault(); hi = Math.max(-1, hi - 1); input.value = hi < 0 ? "" : hist[hi]; }
      } });
    let hi = -1;
    const out = h("pre", { class: "output", style: { maxHeight: "none", minHeight: "320px" } });
    const meta = h("span", { class: "muted small" });
    const runBtn = h("button", { class: "btn primary", onclick: () => busy(runBtn, async () => {
      const cmd = input.value.trim();
      if (!cmd) return;
      const ix = hist.indexOf(cmd);
      if (ix >= 0) hist.splice(ix, 1);
      hist.unshift(cmd); store.set("cmdHistory", hist.slice(0, 50)); hi = -1;
      out.textContent = "실행 중…"; meta.textContent = "";
      const r = await POST("/api/exec", { command: cmd });
      out.textContent = r.output || "(출력 없음)";
      meta.textContent = r.task ? "전송 현황에 추가됨" : `종료 코드 ${r.returncode} · ${r.elapsed}초`;
      if (r.task) toast("다운로드/업로드는 전송 현황에서 진행됩니다.", "ok");
      refreshInfo();
    }) }, "실행");
    const helpBtn = h("button", { class: "btn", onclick: () => busy(helpBtn, async () => {
      const first = input.value.trim().split(/\s+/).filter((w) => !w.startsWith("-")).slice(0, 2).join(" ");
      const r = await GET("/api/help?" + qs({ command: first }));
      out.textContent = r.output;
    }) }, "도움말");
    body.replaceChildren(
      h("div", { class: "panel" }, h("div", { class: "panel-body" },
        h("div", { class: "input-row" }, h("span", { class: "mono muted", style: { alignSelf: "center" } }, "BaiduPCS-Go"), input, helpBtn, runBtn),
        h("p", { class: "help", style: { margin: "8px 0 0" } }, "확인 질문이 필요한 명령(su, 대화형 login 등)은 대화형 터미널에서 실행하세요. download/upload 는 자동으로 전송 현황으로 보내집니다. ↑↓ 로 이전 명령을 불러옵니다."))),
      h("div", { class: "panel" }, h("div", { class: "panel-head" }, h("h2", null, "출력"), meta, h("span", { class: "spacer" }),
        h("button", { class: "btn sm", onclick: () => copyText(out.textContent) }, icon("copy"), "복사")), h("div", { class: "panel-body" }, out)));
    input.focus();
  }

  function reference() {
    body.replaceChildren(h("div", { class: "panel" }, h("div", { class: "panel-body" },
      h("p", { class: "muted", style: { marginTop: 0 } }, "누르면 “명령 한 번 실행” 에 채워집니다. 원문 설명은 github.com/qjfoidnh/BaiduPCS-Go 의 README 를 참고하세요."),
      h("div", { class: "cmdref" }, COMMANDS.map(([group, cmds]) => [h("h4", null, group),
        cmds.map(([c, d]) => h("button", { onclick: () => { tab = "run"; store.set("termTab", "run"); show(c); } }, h("code", null, c), h("span", null, d)))])))));
  }

  show();
};

// =================================================================== 설정
const PRESETS = {
  normal: { label: "일반 회원 권장", values: { max_parallel: 1, max_download_load: 1 }, note: "README 권장: 일반 회원은 max_parallel, max_download_load 를 모두 1 로. 늘리면 몇 시간~며칠 속도 제한이 걸릴 수 있습니다." },
  svip: { label: "SVIP 권장", values: { max_parallel: 10, max_download_load: 2 }, note: "README 권장: SVIP 는 max_parallel 10 이상(20 이하), max_download_load 1~2." },
};

PAGES.config = async (view) => {
  view.append(h("div", { class: "loading" }, "설정을 불러오는 중"));
  let data;
  try { data = await GET("/api/config"); } catch (e) { view.replaceChildren(h("div", { class: "notice err" }, e.message)); return; }
  const original = { ...data.values };
  const values = { ...data.values };
  const controls = {};
  const savebar = h("div", { class: "savebar", hidden: true });

  function changedKeys() { return Object.keys(values).filter((k) => String(values[k]) !== String(original[k])); }
  function refresh() {
    const ch = changedKeys();
    Object.entries(controls).forEach(([k, c]) => c.row.classList.toggle("changed", ch.includes(k)));
    savebar.hidden = !ch.length;
    savebar.replaceChildren(h("span", null, `${ch.length}개 항목을 바꿨습니다`), h("span", { class: "spacer" }),
      h("button", { class: "btn sm", onclick: () => { Object.assign(values, original); Object.entries(controls).forEach(([k, c]) => c.set(values[k])); refresh(); } }, "되돌리기"),
      saveBtn);
  }
  const saveBtn = h("button", { class: "btn sm primary", onclick: () => busy(saveBtn, async () => {
    const changes = Object.fromEntries(changedKeys().map((k) => [k, values[k]]));
    const r = await api("PUT", "/api/config", { values: changes });
    if (!r.ok) { showOutput("설정을 저장하지 못했습니다", r.output); }
    else toast("설정을 저장했습니다.", "ok");
    Object.assign(original, r.values); Object.assign(values, r.values);
    Object.entries(controls).forEach(([k, c]) => c.set(values[k]));
    refresh();
  }) }, "저장");

  function control(f) {
    let el, set;
    if (f.type === "bool") {
      const cb = h("input", { type: "checkbox", checked: !!values[f.key], onchange: () => { values[f.key] = cb.checked; refresh(); } });
      el = h("label", { class: "switch" }, cb, h("span"));
      set = (v) => { cb.checked = !!v; };
    } else if (f.type === "select") {
      el = h("select", { class: "input", onchange: (e) => { values[f.key] = e.target.value; refresh(); } }, f.options.map(([v, l]) => h("option", { value: v, selected: values[f.key] === v }, l)));
      set = (v) => { el.value = v; };
    } else {
      el = h("input", { class: "input", type: f.type === "int" ? "number" : "text", value: values[f.key] ?? "", placeholder: f.hint || "",
        oninput: (e) => { values[f.key] = f.type === "int" ? (e.target.value === "" ? 0 : parseInt(e.target.value, 10)) : e.target.value; refresh(); } });
      set = (v) => { el.value = v ?? ""; };
    }
    const extra = [];
    if (f.key === "savedir") extra.push(h("button", { class: "btn sm", onclick: async () => { const p = await pickLocalFolder(values.savedir); if (p) { values.savedir = p; set(p); refresh(); } } }, "찾아보기"));
    const reset = h("button", { class: "btn sm ghost", title: "기본값으로", onclick: () => { values[f.key] = f.type === "bool" ? f.default : f.default; set(values[f.key]); refresh(); } }, "기본값");
    const row = h("div", { class: "cfg-row" },
      h("div", { class: "meta" }, h("strong", null, f.label), h("code", null, f.flag || f.key), f.help ? h("p", null, f.help) : null),
      h("div", { class: "ctl" }, el, ...extra, reset, f.hint && f.type !== "string" ? h("span", { class: "muted small" }, f.hint) : null));
    controls[f.key] = { row, set };
    return row;
  }

  const groups = [...new Set(data.schema.map((f) => f.group))];
  view.replaceChildren(
    h("div", { class: "panel", style: { marginBottom: "18px" } }, h("div", { class: "panel-head" }, h("h2", null, "빠른 설정"), h("span", { class: "sub" }, "GitHub README 의 권장값")),
      h("div", { class: "panel-body" }, h("div", { class: "row" }, Object.entries(PRESETS).map(([k, p]) => h("button", { class: "btn", title: p.note, onclick: () => {
        Object.entries(p.values).forEach(([kk, v]) => { values[kk] = v; controls[kk].set(v); }); refresh(); toast(p.note); } }, p.label)),
        h("span", { class: "spacer" }),
        h("button", { class: "btn ghost", onclick: async () => { const r = await GET("/api/config/raw"); showOutput("BaiduPCS-Go config 원문", r.output); } }, "원문 보기")),
        h("p", { class: "help", style: { margin: "10px 0 0" } }, "프리셋을 누르면 값만 채워집니다. 아래 저장 버튼을 눌러야 적용됩니다."))),
    notifyPanel(),
    ...groups.map((g) => h("div", { class: "panel cfg-group" }, h("h3", null, g), data.schema.filter((f) => f.group === g).map(control))),
    savebar);
  refresh();
};

// ------------------------------------------------------------ 알림 설정 패널
function notifyPanel() {
  const body = h("div", { class: "panel-body" }, h("div", { class: "loading" }, "불러오는 중"));
  const panel = h("div", { class: "panel", style: { marginBottom: "18px" } },
    h("div", { class: "panel-head" }, h("h2", null, "알림"), h("span", { class: "sub" }, "다운로드가 끝나거나 실패하면 알려줍니다")), body);
  (async () => {
    let cfg;
    try { cfg = await GET("/api/notify"); } catch (e) { body.replaceChildren(h("div", { class: "notice err" }, e.message)); return; }
    const v = { ...cfg };
    const inp = (k, ph, type = "text") => h("input", { class: "input mono", type, value: v[k] || "", placeholder: ph, oninput: (e) => { v[k] = e.target.value; } });
    const sw = (k, label) => h("label", { class: "check" }, h("input", { type: "checkbox", checked: !!v[k], onchange: (e) => { v[k] = e.target.checked; } }), h("span", null, label));
    const status = h("span", { class: "muted small" }, cfg.configured ? "설정됨" : "아직 설정된 채널이 없습니다");

    const saveBtn = h("button", { class: "btn primary", onclick: () => busy(saveBtn, async () => {
      const r = await api("PUT", "/api/notify", v);
      Object.assign(v, r); status.textContent = r.configured ? "저장했습니다" : "저장했습니다 (설정된 채널 없음)";
      toast("알림 설정을 저장했습니다.", "ok");
    }) }, "저장");
    const testBtn = h("button", { class: "btn", onclick: () => busy(testBtn, async () => {
      await api("PUT", "/api/notify", v);
      const r = await POST("/api/notify/test");
      showOutput("알림 테스트 결과", Object.entries(r.results).map(([k, x]) => `${k}: ${x}`).join("\n"));
    }) }, "테스트 보내기");

    // 브라우저 알림 (HTTPS 에서만 가능)
    let browserRow;
    if (!browserNotifySupported()) {
      browserRow = h("p", { class: "help", style: { margin: 0 } }, "브라우저 알림은 HTTPS 로 접속했을 때만 쓸 수 있습니다 (DSM 역방향 프록시 사용). 지금은 이 화면을 열어 두면 화면 안 알림만 표시됩니다.");
    } else {
      const bcb = h("input", { type: "checkbox", checked: browserNotifyOn(), onchange: async (e) => {
        if (e.target.checked && Notification.permission !== "granted") {
          const p = await Notification.requestPermission();
          if (p !== "granted") { e.target.checked = false; toast("브라우저에서 알림 권한을 허용해야 합니다.", "err"); return; }
        }
        store.set("browserNotify", e.target.checked);
      } });
      browserRow = h("label", { class: "check" }, bcb, h("span", null, "이 브라우저에도 알림 표시", h("small", null, "탭이 다른 화면에 있을 때 데스크톱 알림을 띄웁니다")));
    }

    body.replaceChildren(
      h("div", { class: "checks" }, sw("on_done", "완료되면 알림"), sw("on_fail", "실패하면 알림")),
      h("div", { class: "num-grid" },
        h("div", { class: "field" }, h("label", null, "텔레그램 봇 토큰"), inp("telegram_token", "123456789:AA..."),
          h("p", { class: "help" }, "텔레그램 @BotFather 에서 봇을 만들면 받는 토큰입니다.")),
        h("div", { class: "field" }, h("label", null, "텔레그램 Chat ID"), inp("telegram_chat_id", "예: 123456789"),
          h("p", { class: "help" }, "봇에게 먼저 아무 메시지를 보낸 뒤, @userinfobot 등으로 내 ID 를 확인하세요."))),
      h("div", { class: "field" }, h("label", null, "디스코드 웹훅 URL"), inp("discord_webhook", "https://discord.com/api/webhooks/..."),
        h("p", { class: "help" }, "디스코드 채널 설정 → 연동 → 웹후크에서 만들 수 있습니다.")),
      h("div", { class: "field" }, h("label", null, "일반 웹훅 URL (선택)"), inp("webhook_url", "https://..."),
        h("p", { class: "help" }, "작업 정보를 JSON 으로 POST 합니다. 다른 자동화 도구와 연결할 때 쓰세요.")),
      h("div", { class: "row", style: { marginBottom: "14px" } }, saveBtn, testBtn, status),
      browserRow);
  })();
  return panel;
}

// =================================================================== 계정
function parseCookieFlags(text) {
  const get = (k) => { const m = text.match(new RegExp("(?:^|[;\\s])" + k + "=([^;\\s]+)")); return m ? m[1] : ""; };
  return { BDUSS: get("BDUSS"), STOKEN: get("STOKEN"), PTOKEN: get("PTOKEN") };
}

PAGES.account = async (view) => {
  const info = await refreshInfo();
  const cur = info.current;

  // 현재 계정
  const quotaBox = h("div");
  const curPanel = h("div", { class: "panel" }, h("div", { class: "panel-head" }, h("h2", null, "현재 계정")),
    h("div", { class: "panel-body" }, cur ? [
      h("div", { class: "acct-card" }, h("div", { class: "big-avatar" }, (cur.name || "?").slice(0, 1).toUpperCase()),
        h("div", null, h("h3", null, cur.name || "(이름 없음)"), h("div", { class: "muted" }, "uid " + cur.uid))),
      h("dl", { class: "kv" },
        h("dt", null, "작업 폴더"), h("dd", { class: "mono" }, cur.workdir),
        h("dt", null, "STOKEN"), h("dd", null, cur.has_stoken ? h("span", { class: "tag ok" }, "있음") : h("span", { class: "tag warn" }, "없음 — 공유 링크 저장 불가")),
        h("dt", null, "accessToken"), h("dd", null, cur.has_accesstoken ? h("span", { class: "tag ok" }, "설정됨") : h("span", { class: "tag" }, "미설정 (보통 필요 없음)"))),
      quotaBox,
      h("div", { class: "row", style: { marginTop: "16px" } },
        h("a", { class: "btn primary", href: "#/files" }, "넷디스크 열기"),
        h("button", { class: "btn", onclick: astoken }, "accessToken 설정"),
        h("button", { class: "btn danger", onclick: logout }, "로그아웃")),
    ] : h("div", { class: "empty", style: { padding: "24px 0" } }, h("h3", null, "로그인한 계정이 없습니다"), h("p", { style: { margin: 0 } }, "오른쪽에서 로그인하세요."))));

  if (cur) {
    quotaBox.append(h("div", { class: "loading", style: { padding: "16px 0 0", textAlign: "left" } }, "용량 확인 중"));
    GET("/api/quota").then((r) => {
      state.quota = r.quota; renderChrome();
      quotaBox.replaceChildren(r.quota ? h("div", { style: { marginTop: "16px" } },
        h("div", { class: "row" }, h("strong", null, "용량"), h("span", { class: "spacer" }), h("span", { class: "muted" }, `${fmtSize(r.quota.used)} / ${fmtSize(r.quota.total)}`)),
        h("div", { class: "quota-bar" }, h("i", { style: { width: Math.min(100, r.quota.used / r.quota.total * 100).toFixed(1) + "%" } })))
        : h("div", { class: "notice err", style: { marginTop: "16px" } }, "용량을 가져오지 못했습니다: ", r.output, " — 로그인 정보가 만료되었을 수 있습니다. 다시 로그인해 보세요."));
    });
  }

  // 계정 목록
  const others = info.accounts;
  const listPanel = others.length > 1 ? h("div", { class: "panel" }, h("div", { class: "panel-head" }, h("h2", null, "로그인한 계정"), h("span", { class: "sub" }, `${others.length}개`)),
    h("div", { class: "panel-body acct-list" }, others.map((a) => h("div", { class: "item" },
      h("div", { class: "big-avatar", style: { width: "34px", height: "34px", fontSize: "14px" } }, (a.name || "?").slice(0, 1).toUpperCase()),
      h("div", { style: { flex: 1, minWidth: 0 } }, h("strong", null, a.name || "(이름 없음)"), h("div", { class: "muted small" }, "uid " + a.uid)),
      a.active ? h("span", { class: "tag ok" }, "사용 중") : h("button", { class: "btn sm", onclick: (e) => busy(e.currentTarget, async () => {
        const r = await POST("/api/account/su", { uid: a.uid });
        toast(r.ok ? `${a.name} 계정으로 바꿨습니다.` : r.output, r.ok ? "ok" : "err");
        store.set("lastPath", "/"); route(); refreshQuota();
      }) }, "전환"))))) : null;

  // 로그인 폼
  let mode = store.get("loginMode", "cookies");
  const loginBody = h("div");
  function renderLogin() {
    const tabs = h("div", { class: "tabs" }, [["cookies", "Cookies (권장)"], ["bduss", "BDUSS + STOKEN"], ["password", "아이디/비밀번호"]].map(([k, l]) =>
      h("button", { class: `tab ${mode === k ? "active" : ""}`, onclick: () => { mode = k; store.set("loginMode", k); renderLogin(); } }, l)));
    const out = h("pre", { class: "output wrap", hidden: true, style: { marginTop: "12px" } });
    const fix = h("div");
    let form;
    if (mode === "cookies") {
      const ta = h("textarea", { class: "input", rows: 5, placeholder: "BAIDUID=...; BDUSS=...; STOKEN=...; ...", oninput: check });
      const flags = h("div", { class: "row small", style: { marginTop: "4px" } });
      function check() {
        const f = parseCookieFlags(ta.value);
        flags.replaceChildren(...["BDUSS", "STOKEN"].map((k) => h("span", { class: `tag ${f[k] ? "ok" : ta.value ? "warn" : ""}` }, `${k} ${f[k] ? "확인" : "없음"}`)),
          ta.value && !f.STOKEN ? h("span", { class: "muted" }, "STOKEN 이 없으면 공유 링크 저장이 안 됩니다. pan.baidu.com 에서 복사했는지 확인하세요.") : null);
      }
      check();
      const btn = h("button", { class: "btn primary", onclick: () => busy(btn, async () => {
        const payload = { mode: "cookies", cookies: ta.value.trim() };
        done(await POST("/api/account/login", payload), out, fix, payload);
      }) }, "로그인");
      form = [h("div", { class: "field" }, h("label", null, "pan.baidu.com 의 Cookies 전체"), ta, flags), btn,
        h("div", { class: "howto", style: { marginTop: "14px" } }, h("strong", null, "Cookies 복사 방법"),
          h("ol", null, h("li", null, "PC 브라우저에서 pan.baidu.com 에 로그인합니다."), h("li", null, "F12 → Network(네트워크) 탭 → 새로고침 후 아무 요청이나 누릅니다."),
            h("li", null, "Request Headers 의 Cookie 값을 통째로 복사해 붙여넣습니다.")))];
    } else if (mode === "bduss") {
      const bduss = h("input", { class: "input mono" }), stoken = h("input", { class: "input mono" }), ptoken = h("input", { class: "input mono" });
      const btn = h("button", { class: "btn primary", onclick: () => busy(btn, async () => {
        const payload = { mode: "bduss", bduss: bduss.value, stoken: stoken.value, ptoken: ptoken.value };
        done(await POST("/api/account/login", payload), out, fix, payload);
      }) }, "로그인");
      form = [h("div", { class: "field" }, h("label", null, "BDUSS"), bduss),
        h("div", { class: "field" }, h("label", null, "STOKEN"), stoken, h("p", { class: "help" }, "반드시 pan.baidu.com 의 쿠키에서 가져오세요. bdstoken 과 다릅니다. 대문자가 없다면 잘못 가져온 값일 가능성이 큽니다.")),
        h("div", { class: "field" }, h("label", null, "PTOKEN (선택)"), ptoken), btn,
        h("div", { class: "howto", style: { marginTop: "14px" } }, "F12 → Application(애플리케이션) → Cookies → https://pan.baidu.com 에서 BDUSS, STOKEN 값을 복사합니다.")];
    } else {
      form = [h("div", { class: "notice" }, "아이디/비밀번호 로그인은 GitHub README 기준으로 유지보수가 중단되었고, 휴대폰/이메일 인증·캡차 입력이 필요해 대화형 터미널에서만 할 수 있습니다. 가능하면 Cookies 로그인을 쓰세요."),
        h("a", { class: "btn", href: "#/terminal?tab=shell" }, "대화형 터미널 열기"),
        h("p", { class: "help" }, "터미널에서 login 을 입력하고 안내에 따라 진행하세요.")];
    }
    loginBody.replaceChildren(tabs, ...form, fix, out);
  }
  async function done(r, out, fix, payload) {
    out.hidden = false; out.textContent = r.output;
    const warns = (r.warnings || []).map((w) => h("div", { class: "notice", style: { marginTop: "12px", marginBottom: 0 } }, w));
    if (r.ok) {
      toast("로그인했습니다." + (r.verified ? " 넷디스크 접속도 확인했습니다." : ""), "ok");
      (r.warnings || []).forEach((w) => toast(w));
      store.set("lastPath", "/"); await refreshInfo(); refreshQuota(); route();
      return;
    }
    if (!r.tieba_failed) {
      fix.replaceChildren(...warns);
      toast("로그인하지 못했습니다. 출력 내용을 확인하세요.", "err");
      return;
    }
    // 티에바(贴吧) BDUSS 검증 서버가 거부한 경우: 원인 안내 + 검증 건너뛰기
    const name = h("input", { class: "input", value: store.get("forceName", "baidu"), style: { maxWidth: "200px" } });
    const skipBtn = h("button", { class: "btn primary", onclick: () => busy(skipBtn, async () => {
      store.set("forceName", name.value.trim() || "baidu");
      const r2 = await POST("/api/account/login", { ...payload, skip_check: true, name: name.value.trim() || "baidu" });
      if (!r2.ok) {
        out.textContent = r2.output;
        fix.replaceChildren(h("div", { class: "notice err", style: { marginTop: "12px" } },
          h("strong", null, "BDUSS 자체가 유효하지 않습니다. "), "검증 없이 등록한 뒤 넷디스크 접속을 시도했지만 실패해서 등록을 취소했습니다. ",
          "pan.baidu.com 에 새로 로그인해서 Cookies 를 다시 복사하세요. 복사한 뒤 브라우저에서 ‘로그아웃’ 하면 그 BDUSS 는 바로 무효가 되니 탭만 닫으세요."));
        toast("BDUSS 가 유효하지 않습니다.", "err");
        return;
      }
      done(r2, out, fix, payload);
    }) }, "검증 건너뛰고 로그인");
    fix.replaceChildren(h("div", { class: "notice", style: { marginTop: "12px" } },
      h("p", { style: { margin: "0 0 8px" } }, h("strong", null, "바이두 티에바(贴吧) 서버가 이 BDUSS 를 거부했습니다. "),
        "BaiduPCS-Go 는 로그인할 때 티에바 서버로 BDUSS 를 확인하는데, 원인은 둘 중 하나입니다."),
      h("ol", { style: { margin: "0 0 10px", paddingLeft: "18px" } },
        h("li", null, h("strong", null, "BDUSS 가 무효: "), "만료됐거나, 복사한 뒤 브라우저에서 로그아웃했거나, 일부만/BDUSS_BFESS 를 복사한 경우. pan.baidu.com 에 새로 로그인해 다시 복사하고, 탭은 로그아웃하지 말고 닫기만 하세요."),
        h("li", null, h("strong", null, "티에바 확인만 막힘: "), "BDUSS 는 정상인데 해외(한국) IP 나 계정 상태 때문에 티에바 확인만 거부되는 경우. 아래 버튼으로 확인을 건너뛰세요 (원 프로젝트의 force_login_username 기능).")),
      h("div", { class: "row" }, h("span", { class: "small" }, "표시할 이름"), name, skipBtn),
      h("p", { class: "help", style: { margin: "8px 0 0" } },
        "건너뛴 뒤 바로 넷디스크 용량 조회로 실제 접속을 확인하고, 실패하면 자동으로 등록을 취소합니다. 이 방식으로 등록한 계정은 uid 가 24 로 고정되어 한 개만 등록됩니다.")),
      ...warns);
    toast("티에바 BDUSS 확인에 실패했습니다. 아래 안내를 확인하세요.", "err");
  }
  renderLogin();

  async function logout() {
    if (!await confirmBox("로그아웃", `${cur.name} 계정에서 로그아웃할까요? 저장된 로그인 정보가 지워집니다.`, { danger: true, ok: "로그아웃" })) return;
    const r = await POST("/api/account/logout");
    toast(r.output || "로그아웃했습니다."); state.quota = null; await refreshInfo(); route();
  }
  async function astoken() {
    const t = await promptBox("accessToken 설정", "accessToken", "", { help: "빠른 업로드 링크로 저장할 때만 필요합니다. 유효기간은 한 달입니다.", ok: "저장" });
    if (!t) return;
    const r = await POST("/api/account/astoken", { token: t });
    showOutput("accessToken", r.output);
    route();
  }

  view.replaceChildren(h("div", { class: "grid-2" },
    h("div", null, curPanel, listPanel),
    h("div", { class: "panel" }, h("div", { class: "panel-head" }, h("h2", null, cur ? "다른 계정 추가" : "바이두 로그인")), h("div", { class: "panel-body" }, loginBody))),
    h("p", { class: "muted small", style: { marginTop: "18px" } },
      `BaiduPCS-Go ${info.pcs_version} · Web UI ${info.webui_version} · 설정 ${info.config_dir} · 다운로드 ${info.download_dir} · 업로드 ${info.upload_dir}`));
};

// =================================================================== 웹 UI 인증 화면
function showGate() {
  if ($(".gate")) return;
  const pw = h("input", { class: "input", type: "password", placeholder: "비밀번호", autocomplete: "current-password" });
  const err = h("div", { class: "notice err", hidden: true });
  const btn = h("button", { class: "btn primary", style: { width: "100%" }, type: "submit" }, "들어가기");
  const gate = h("div", { class: "gate" }, h("form", { class: "card", onsubmit: (e) => { e.preventDefault(); busy(btn, async () => {
    try {
      await api("POST", "/api/auth/login", { password: pw.value }, { noAuthRedirect: true });
      gate.remove(); $("#app").hidden = false; boot();
    } catch (ex) { err.hidden = false; err.textContent = ex.message; pw.select(); }
  }); } },
    h("h2", null, "BaiduPCS Web"), h("p", null, "docker-compose 의 WEB_PASSWORD 로 들어갑니다."), err,
    h("div", { class: "field" }, pw), btn));
  $("#app").hidden = true;
  document.body.append(gate);
  setTimeout(() => pw.focus(), 30);
}

// =================================================================== 시작
async function boot() {
  try {
    const auth = await api("GET", "/api/auth/status", undefined, { noAuthRedirect: true });
    if (auth.required && !auth.authed) return showGate();
    $("#web-logout").hidden = !auth.required;
    await refreshInfo();
  } catch (e) {
    $("#view").replaceChildren(h("div", { class: "notice err" }, "서버에 연결하지 못했습니다: " + e.message));
    return;
  }
  if (!state.info.current && !location.hash) location.hash = "#/account";
  route();
  refreshQuota();
  pollBadge();
  if (!state.badgeTimer) {
    state.badgeTimer = setInterval(pollBadge, 5000);
    setInterval(refreshQuota, 5 * 60 * 1000);
  }
}

window.addEventListener("hashchange", route);
$("#menu-btn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
$("#scrim").addEventListener("click", () => document.body.classList.remove("nav-open"));
$("#web-logout").addEventListener("click", async () => { await POST("/api/auth/logout"); location.reload(); });
boot();
})();
