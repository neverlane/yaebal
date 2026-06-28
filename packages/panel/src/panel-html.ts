/** the operator panel ui — a single static page: token login, then the live chat view. */
export const PANEL_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>yaebal panel</title>
<style>
  :root { color-scheme: light dark; --bg:#0f1115; --panel:#171a21; --line:#252a33; --muted:#8b93a1; --accent:#229ED9; --accent-2:#1b87ba; --text:#e6e8eb; --danger:#e5484d; }
  * { box-sizing: border-box; }
  body { margin:0; font:14px/1.5 system-ui,-apple-system,sans-serif; background:var(--bg); color:var(--text); height:100vh; display:flex; }

  /* ---- login ---- */
  #login { margin:auto; width:300px; display:flex; flex-direction:column; gap:14px; padding:24px; }
  #login .brand { text-align:center; font-size:20px; font-weight:600; letter-spacing:-.2px; }
  #login .brand b { color:var(--accent); }
  #login .sub { text-align:center; color:var(--muted); font-size:12px; margin-top:-8px; }
  #login input, #login button { width:100%; height:44px; border-radius:10px; font:inherit; padding:0 14px; }
  #login input { background:var(--panel); border:1px solid var(--line); color:var(--text); text-align:center; }
  #login input:focus { outline:none; border-color:var(--accent); }
  #login button { background:var(--accent); color:#fff; border:0; cursor:pointer; font-weight:600; transition:background .15s; }
  #login button:hover { background:var(--accent-2); }
  #login button:disabled { opacity:.6; cursor:default; }
  #login .err { color:var(--danger); font-size:12px; text-align:center; min-height:16px; }

  /* ---- app ---- */
  #app { display:none; flex:1; }
  body.authed #login { display:none; }
  body.authed #app { display:flex; }
  #chats { width:280px; border-right:1px solid var(--line); overflow-y:auto; flex:none; display:flex; flex-direction:column; }
  #chats .top { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; }
  #chats .top h1 { font-size:13px; color:var(--muted); margin:0; letter-spacing:.5px; text-transform:lowercase; }
  #chats .top button { background:none; border:0; color:var(--muted); cursor:pointer; font:inherit; font-size:12px; }
  #chats .top button:hover { color:var(--text); }
  .chat { padding:10px 16px; border-top:1px solid var(--line); cursor:pointer; }
  .chat:hover, .chat.on { background:var(--panel); }
  .chat .n { font-weight:500; }
  .chat .l { color:var(--muted); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #main { flex:1; display:flex; flex-direction:column; min-width:0; }
  #log { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:8px; }
  #log .more { align-self:center; background:none; border:1px solid var(--line); color:var(--muted); border-radius:999px; padding:4px 14px; cursor:pointer; font:inherit; font-size:12px; }
  .msg { max-width:70%; padding:8px 12px; border-radius:12px; white-space:pre-wrap; word-break:break-word; }
  .msg.in { background:var(--panel); align-self:flex-start; }
  .msg.out { background:var(--accent); color:#fff; align-self:flex-end; }
  .msg img, .msg video { max-width:280px; max-height:320px; border-radius:8px; display:block; }
  .msg audio { width:260px; display:block; }
  .msg .cap { margin-top:6px; }
  .msg .media + .media { margin-top:6px; }
  .msg .doc { display:inline-flex; align-items:center; gap:6px; color:inherit; text-decoration:none; border-bottom:1px dotted currentColor; }
  .msg.album { display:flex; flex-wrap:wrap; gap:4px; max-width:300px; }
  .msg.album img, .msg.album video { max-width:140px; max-height:140px; margin:0; }
  .msg.album .cap { flex-basis:100%; }
  #composer { display:flex; gap:8px; padding:12px; border-top:1px solid var(--line); }
  #composer input.text { flex:1; background:var(--panel); border:1px solid var(--line); color:var(--text); border-radius:8px; padding:9px 12px; font:inherit; }
  #composer button { background:var(--accent); color:#fff; border:0; border-radius:8px; padding:0 16px; cursor:pointer; font:inherit; }
  #composer .attach { background:var(--panel); border:1px solid var(--line); color:var(--muted); padding:0 12px; }
  #composer .attach:hover { color:var(--text); }
  #empty { margin:auto; color:var(--muted); }
</style>
</head>
<body>
<form id="login">
  <div class="brand"><b>@yaebal</b>/panel</div>
  <div class="sub">operator panel</div>
  <input id="token" type="password" placeholder="access token" autocomplete="off" autofocus />
  <button id="go" type="submit">authorize</button>
  <div class="err" id="err"></div>
</form>

<div id="app">
  <div id="chats"><div class="top"><h1>chats</h1><button id="logout" type="button">log out</button></div></div>
  <div id="main"><div id="empty">select a chat</div></div>
</div>

<script>
const BASE = "__BASE__";
const KEY = "yaebal-panel-token" + BASE;
let token = sessionStorage.getItem(KEY) || "";
let active = null, oldest = null, es = null;

const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const api = (p, opt = {}) => fetch(BASE + p, { ...opt, headers: { ...(opt.headers||{}), authorization: "Bearer " + token } });

/* ---- auth ---- */
const login = document.getElementById("login");
login.onsubmit = async (e) => {
  e.preventDefault();
  const go = document.getElementById("go"), err = document.getElementById("err");
  token = document.getElementById("token").value.trim();
  if (!token) return;
  go.disabled = true; err.textContent = "";
  const res = await api("/api/chats").catch(() => null);
  go.disabled = false;
  if (!res || !res.ok) { err.textContent = "invalid token"; return; }
  sessionStorage.setItem(KEY, token);
  enter();
};
document.getElementById("logout").onclick = () => {
  sessionStorage.removeItem(KEY); token = ""; active = null;
  if (es) { es.close(); es = null; }
  document.body.classList.remove("authed");
  document.getElementById("token").value = "";
};

function enter() {
  document.body.classList.add("authed");
  loadChats();
  openStream();
}

/* ---- realtime: instant via SSE, with a slow polling safety net ---- */
function openStream() {
  if (es || !window.EventSource) return;
  es = new EventSource(BASE + "/api/stream?token=" + encodeURIComponent(token));
  es.addEventListener("record", (ev) => {
    const e = JSON.parse(ev.data);
    if (active && e.chatId === active) openChat(active, true);
    loadChats();
  });
  es.onerror = () => {}; // EventSource auto-reconnects
}
setInterval(() => { if (token) (active ? openChat(active, true) : loadChats()); }, 8000);

/* ---- chats ---- */
async function loadChats() {
  const res = await api("/api/chats"); if (!res.ok) return;
  const chats = await res.json();
  const box = document.getElementById("chats");
  box.querySelectorAll(".chat").forEach(n => n.remove());
  for (const c of chats) {
    const d = el("div", "chat" + (c.id === active ? " on" : ""));
    d.append(el("div", "n", c.name), el("div", "l", c.lastText));
    d.onclick = () => openChat(c.id);
    box.append(d);
  }
}

/* ---- media rendering ---- */
const fileSrc = (att) => BASE + "/api/file?id=" + encodeURIComponent(att.fileId) + "&token=" + encodeURIComponent(token);
const isPlaceholder = (t) => /^\[[a-z_]+\]$/.test(t);

function attEl(att) {
  const src = fileSrc(att);
  if (att.type === "photo" || att.type === "sticker") { const i = el("img", "media"); i.src = src; i.loading = "lazy"; return i; }
  if (att.type === "video" || att.type === "animation" || att.type === "video_note") { const v = el("video", "media"); v.src = src; v.controls = true; return v; }
  if (att.type === "voice" || att.type === "audio") { const a = el("audio", "media"); a.src = src; a.controls = true; return a; }
  const link = el("a", "media doc", "📎 " + (att.fileName || att.type)); link.href = src; link.target = "_blank"; return link;
}

function bubble(m) {
  const b = el("div", "msg " + m.direction);
  const atts = m.attachments || [];
  for (const a of atts) b.append(attEl(a));
  if (m.text && !(atts.length && isPlaceholder(m.text))) b.append(el("div", atts.length ? "cap" : null, m.text));
  return b;
}

/* merge consecutive messages sharing a media_group_id into one album bubble */
function renderMsgs(msgs) {
  const out = [];
  let group = null, groupId = null;
  for (const m of msgs) {
    if (m.mediaGroupId && m.mediaGroupId === groupId && group) {
      for (const a of m.attachments || []) group.insertBefore(attEl(a), group.querySelector(".cap"));
      if (m.text && !isPlaceholder(m.text)) group.append(el("div", "cap", m.text));
      continue;
    }
    const b = bubble(m);
    if (m.mediaGroupId) { b.classList.add("album"); group = b; groupId = m.mediaGroupId; }
    else { group = null; groupId = null; }
    out.push(b);
  }
  return out;
}

async function openChat(id, keepScroll) {
  active = id;
  if (!keepScroll) loadChats();
  const res = await api("/api/chats/" + id + "?limit=200"); if (!res.ok) return;
  const msgs = await res.json();
  oldest = msgs.length ? msgs[0].date : null;

  const main = document.getElementById("main");
  const prevTop = keepScroll ? (main.querySelector("#log")?.scrollTop ?? null) : null;
  main.innerHTML = "";

  const log = el("div"); log.id = "log";
  if (msgs.length >= 200) {
    const more = el("button", "more", "load earlier"); more.onclick = () => loadEarlier(id, log);
    log.append(more);
  }
  for (const b of renderMsgs(msgs)) log.append(b);

  const form = el("form"); form.id = "composer";
  const fileInput = el("input"); fileInput.type = "file"; fileInput.style.display = "none";
  const attach = el("button", "attach", "📎"); attach.type = "button"; attach.title = "send a file";
  attach.onclick = () => fileInput.click();
  const input = el("input", "text"); input.placeholder = "reply…"; input.autocomplete = "off";
  const btn = el("button", null, "send"); btn.type = "submit";
  form.append(attach, fileInput, input, btn);

  fileInput.onchange = async () => {
    const file = fileInput.files && fileInput.files[0]; if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    if (input.value.trim()) fd.append("caption", input.value.trim());
    input.value = ""; fileInput.value = "";
    await api("/api/chats/" + id + "/send", { method: "POST", body: fd }); // browser sets multipart boundary
    openChat(id);
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim(); if (!text) return;
    input.value = "";
    await api("/api/chats/" + id + "/send", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({ text }) });
    openChat(id);
  };
  main.append(log, form);
  log.scrollTop = prevTop != null ? prevTop : log.scrollHeight;
}

async function loadEarlier(id, log) {
  if (oldest == null) return;
  const res = await api("/api/chats/" + id + "?limit=200&before=" + oldest); if (!res.ok) return;
  const older = await res.json();
  if (!older.length) { log.querySelector(".more")?.remove(); return; }
  oldest = older[0].date;
  const anchor = log.querySelector(".more")?.nextSibling ?? log.firstChild;
  const frag = document.createDocumentFragment();
  if (older.length >= 200) { const more = el("button", "more", "load earlier"); more.onclick = () => loadEarlier(id, log); frag.append(more); }
  for (const b of renderMsgs(older)) frag.append(b);
  log.querySelector(".more")?.remove();
  log.insertBefore(frag, anchor);
}

if (token) enter();
</script>
</body>
</html>`;
