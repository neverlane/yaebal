/** The operator panel UI — a single static page that talks to the panel API. */
export const PANEL_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>yaebal panel</title>
<style>
  :root { color-scheme: light dark; --bg:#0f1115; --panel:#171a21; --line:#252a33; --muted:#8b93a1; --accent:#229ED9; --text:#e6e8eb; }
  * { box-sizing: border-box; }
  body { margin:0; font:14px/1.5 system-ui,sans-serif; background:var(--bg); color:var(--text); height:100vh; display:flex; }
  #chats { width:280px; border-right:1px solid var(--line); overflow-y:auto; flex:none; }
  #chats h1 { font-size:13px; color:var(--muted); padding:14px 16px; margin:0; letter-spacing:.5px; text-transform:lowercase; }
  .chat { padding:10px 16px; border-bottom:1px solid var(--line); cursor:pointer; }
  .chat:hover, .chat.on { background:var(--panel); }
  .chat .n { font-weight:500; }
  .chat .l { color:var(--muted); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #main { flex:1; display:flex; flex-direction:column; min-width:0; }
  #log { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:8px; }
  .msg { max-width:70%; padding:8px 12px; border-radius:12px; white-space:pre-wrap; word-break:break-word; }
  .msg.in { background:var(--panel); align-self:flex-start; }
  .msg.out { background:var(--accent); color:#fff; align-self:flex-end; }
  #composer { display:flex; gap:8px; padding:12px; border-top:1px solid var(--line); }
  #composer input { flex:1; background:var(--panel); border:1px solid var(--line); color:var(--text); border-radius:8px; padding:9px 12px; font:inherit; }
  #composer button { background:var(--accent); color:#fff; border:0; border-radius:8px; padding:0 16px; cursor:pointer; font:inherit; }
  #empty { margin:auto; color:var(--muted); }
</style>
</head>
<body>
<div id="chats"><h1>chats</h1></div>
<div id="main"><div id="empty">select a chat</div></div>
<script>
const token = new URLSearchParams(location.search).get("token") || "";
const api = (p, opt = {}) => fetch(p, { ...opt, headers: { ...(opt.headers||{}), authorization: "Bearer " + token } });
let active = null;
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };

async function loadChats() {
  const chats = await (await api("/api/chats")).json();
  const box = document.getElementById("chats");
  box.querySelectorAll(".chat").forEach(n => n.remove());
  for (const c of chats) {
    const d = el("div", "chat" + (c.id === active ? " on" : ""));
    d.append(el("div", "n", c.name), el("div", "l", c.lastText));
    d.onclick = () => openChat(c.id);
    box.append(d);
  }
}
async function openChat(id) {
  active = id;
  await loadChats();
  const msgs = await (await api("/api/chats/" + id)).json();
  const main = document.getElementById("main");
  main.innerHTML = "";
  const log = el("div"); log.id = "log";
  for (const m of msgs) log.append(el("div", "msg " + m.direction, m.text));
  const form = el("form"); form.id = "composer";
  const input = el("input"); input.placeholder = "reply…"; input.autocomplete = "off";
  const btn = el("button", null, "send"); btn.type = "submit";
  form.append(input, btn);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim(); if (!text) return;
    input.value = "";
    await api("/api/chats/" + id + "/send", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({ text }) });
    openChat(id);
  };
  main.append(log, form);
  log.scrollTop = log.scrollHeight;
}
loadChats();
setInterval(() => (active ? openChat(active) : loadChats()), 4000);
</script>
</body>
</html>`;
