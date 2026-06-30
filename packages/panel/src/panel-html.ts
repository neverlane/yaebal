/** the operator panel ui - a single static page: token login, then the live chat view. */
export const PANEL_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>yaebal panel</title>
<style>
  :root {
    color-scheme: light;
    --primary:#ffffff; --secondary:#000000; --white:#ffffff; --gray:#75757e;
    --blue:#2f8af9; --red:#ed2236;
    --button:#f4f4f4; --button-hover:#ededed; --button-press:#e8e8e8;
    --button-stroke:rgba(0,0,0,.06); --button-text:#282828;
    --sidebar-bg:#fbfbfb; --sidebar-stroke:rgba(0,0,0,.06);
    --content-border:rgba(0,0,0,.08); --input-border:#adadb7;
    --radius:18px; --radius-sm:12px; --sidebar-width:320px;
    --shadow:0 18px 70px rgba(0,0,0,.14);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --primary:#000000; --secondary:#e1e1e1; --gray:#818181;
      --blue:#2a7ce1; --red:#ff5b70;
      --button:#191919; --button-hover:#242424; --button-press:#2a2a2a;
      --button-stroke:rgba(255,255,255,.05); --button-text:#e1e1e1;
      --sidebar-bg:#0c0c0c; --sidebar-stroke:rgba(255,255,255,.05);
      --content-border:rgba(255,255,255,.08); --input-border:#383838;
      --shadow:0 18px 70px rgba(0,0,0,.42);
    }
  }
  * { box-sizing:border-box; margin:0; }
  html, body { height:100%; }
  body {
    min-height:100%; overflow:hidden; background:var(--primary); color:var(--secondary);
    font:15px/1.5 "IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
  }
  button, input { font:inherit; }
  button { color:inherit; }
  svg { display:block; width:18px; height:18px; }
  .ico { display:inline-flex; align-items:center; justify-content:center; flex:none; }
  :focus-visible { outline:solid 2px var(--blue); outline-offset:-2px; }
  ::selection { background:var(--secondary); color:var(--primary); }
  ::-webkit-scrollbar { width:10px; height:10px; }
  ::-webkit-scrollbar-thumb { background:var(--button-press); border-radius:10px; border:2px solid var(--primary); }

  @keyframes fade-in { from { opacity:0; } to { opacity:1; } }
  @keyframes rise-in { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  @keyframes slide-in { from { opacity:0; transform:translateX(-10px); } to { opacity:1; transform:translateX(0); } }
  @keyframes msg-in { from { opacity:0; transform:translateY(8px) scale(.985); } to { opacity:1; transform:translateY(0) scale(1); } }
  @keyframes viewer-in { from { opacity:0; backdrop-filter:blur(0); } to { opacity:1; backdrop-filter:blur(10px); } }
  @keyframes soft-pulse { 0%, 100% { transform:scaleY(.72); opacity:.45; } 50% { transform:scaleY(1); opacity:.95; } }

  #login { width:min(380px, calc(100vw - 32px)); min-height:100%; margin:auto; display:flex; align-items:center; justify-content:center; padding:24px; }
  #login .card { width:100%; padding:24px; border:1px solid var(--content-border); border-radius:20px; background:var(--sidebar-bg); animation:rise-in .32s ease both; }
  #login .mark { width:44px; height:44px; border-radius:14px; display:grid; place-items:center; margin:0 auto 18px; background:var(--secondary); color:var(--primary); }
  #login .mark svg { width:22px; height:22px; }
  #login .brand { text-align:center; font-size:20px; font-weight:700; letter-spacing:-.5px; }
  #login .brand b { font-weight:700; }
  #login .sub { margin:4px 0 20px; text-align:center; color:var(--gray); font-size:13px; font-weight:500; }
  #login input, #login button { width:100%; height:44px; border-radius:14px; padding:0 14px; }
  #login input { border:1px solid var(--input-border); background:var(--primary); color:var(--secondary); text-align:center; outline:none; transition:border-color .16s ease, box-shadow .16s ease; }
  #login input:focus { border-color:var(--blue); box-shadow:0 0 0 4px color-mix(in srgb, var(--blue) 15%, transparent); }
  #login button { margin-top:10px; border:0; background:var(--secondary); color:var(--primary); font-weight:600; cursor:pointer; transition:opacity .16s ease, transform .16s ease; }
  #login button:hover { opacity:.86; }
  #login button:active { transform:translateY(1px); }
  #login button:disabled { opacity:.55; cursor:default; transform:none; }
  #login .err { min-height:18px; margin-top:12px; text-align:center; color:var(--red); font-size:12px; }

  #app { height:100%; display:none; animation:fade-in .2s ease both; }
  body.authed #login { display:none; }
  body.authed #app { display:flex; }
  #chats { width:var(--sidebar-width); flex:none; display:flex; flex-direction:column; min-height:0; background:var(--sidebar-bg); border-right:1px solid var(--sidebar-stroke); }
  #main { flex:1; min-width:0; min-height:0; display:flex; flex-direction:column; background:var(--primary); }

  .side-top { flex:none; padding:20px 16px 18px; display:flex; align-items:center; justify-content:space-between; gap:12px; border-bottom:1px solid var(--sidebar-stroke); }
  .side-title { min-width:0; display:flex; align-items:center; gap:12px; }
  .side-logo { width:38px; height:38px; border-radius:13px; display:grid; place-items:center; background:var(--secondary); color:var(--primary); flex:none; }
  .side-logo svg { width:18px; height:18px; }
  .side-title h1 { font-size:15px; font-weight:600; letter-spacing:-.3px; }
  .side-title p { margin-top:1px; color:var(--gray); font-size:12.5px; font-weight:500; }
  .ghost { width:38px; height:38px; padding:0; border:0; border-radius:14px; display:grid; place-items:center; background:var(--button); color:var(--button-text); box-shadow:0 0 0 1px var(--button-stroke) inset; cursor:pointer; transition:background .16s ease, transform .16s ease; }
  .ghost:hover { background:var(--button-hover); }
  .ghost:active { transform:scale(.97); }

  #chat-list { flex:1; min-height:0; overflow:auto; padding:10px 8px; }
  .chat { width:100%; border:0; background:transparent; color:inherit; display:grid; grid-template-columns:42px 1fr; gap:11px; padding:9px 10px; border-radius:13px; text-align:left; cursor:pointer; animation:slide-in .24s ease both; transition:background .16s ease, color .16s ease, transform .16s ease; }
  .chat:hover { background:var(--button-hover); }
  .chat:active { transform:scale(.99); }
  .chat.on { background:var(--secondary); color:var(--primary); }
  .avatar { width:42px; height:42px; border-radius:13px; display:grid; place-items:center; background:var(--button); color:var(--button-text); box-shadow:0 0 0 1px var(--button-stroke) inset; flex:none; }
  .chat.on .avatar { background:var(--primary); color:var(--secondary); }
  .avatar.small { width:38px; height:38px; border-radius:12px; }
  .avatar svg { width:18px; height:18px; }
  .chat-body { min-width:0; align-self:center; }
  .chat-line { display:flex; align-items:baseline; justify-content:space-between; gap:8px; min-width:0; }
  .chat-name { font-weight:600; letter-spacing:-.2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .chat-handle { color:var(--gray); font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:1px; }
  .chat.on .chat-handle, .chat.on .chat-time, .chat.on .preview { color:color-mix(in srgb, var(--primary) 70%, transparent); }
  .chat-time { color:var(--gray); font-size:11.5px; flex:none; }
  .preview { min-width:0; display:flex; align-items:center; gap:5px; margin-top:4px; color:var(--gray); }
  .preview .ico svg { width:13px; height:13px; }
  .preview-label { font-weight:600; font-size:12px; flex:none; color:inherit; }
  .preview-text { min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:12.5px; }

  #empty { flex:1; display:grid; place-items:center; color:var(--gray); animation:fade-in .22s ease both; }
  #empty .empty-card { text-align:center; padding:28px; }
  #empty .empty-icon { width:58px; height:58px; border:1px solid var(--content-border); border-radius:18px; display:grid; place-items:center; margin:0 auto 14px; background:var(--sidebar-bg); }
  #empty svg { width:26px; height:26px; color:var(--gray); }
  .thread-head { flex:none; min-height:68px; padding:14px 20px; display:flex; align-items:center; gap:12px; border-bottom:1px solid var(--content-border); background:var(--primary); }
  .thread-head .meta { min-width:0; }
  .thread-head .name { font-weight:600; letter-spacing:-.25px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .thread-head .sub { color:var(--gray); font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .back { display:none; }
  #log { flex:1; min-height:0; overflow:auto; padding:22px 24px; display:flex; flex-direction:column; gap:8px; }
  #log .more { align-self:center; border:1px solid var(--content-border); border-radius:999px; background:var(--sidebar-bg); color:var(--gray); padding:6px 13px; cursor:pointer; font-size:12px; transition:border-color .16s ease, color .16s ease; }
  #log .more:hover { border-color:var(--blue); color:var(--secondary); }
  .msg { display:flex; flex-direction:column; max-width:min(560px, 72%); gap:4px; animation:msg-in .22s ease both; }
  .msg.in { align-self:flex-start; transform-origin:left bottom; }
  .msg.out { align-self:flex-end; align-items:flex-end; transform-origin:right bottom; }
  .bubble { border:1px solid var(--content-border); border-radius:16px; padding:9px 11px; background:var(--sidebar-bg); color:var(--secondary); }
  .out .bubble { border-color:var(--blue); background:var(--blue); color:var(--white); }
  .cap { padding:3px 0 0; white-space:pre-wrap; word-break:break-word; }
  .time { color:var(--gray); font-size:11.5px; padding:0 4px; }
  .out .time { color:var(--gray); }

  .media-frame { position:relative; overflow:hidden; border:0; padding:0; cursor:pointer; color:inherit; background:var(--button); border-radius:14px; display:block; max-width:340px; transition:transform .18s ease, filter .18s ease; }
  .media-frame:hover { transform:translateY(-1px); filter:brightness(1.03); }
  .media-frame img, .media-frame video { display:block; width:100%; max-width:340px; max-height:380px; object-fit:cover; border-radius:14px; }
  .expand { position:absolute; right:8px; top:8px; width:30px; height:30px; border:1px solid rgba(255,255,255,.28); border-radius:10px; background:rgba(0,0,0,.42); color:#fff; display:grid; place-items:center; opacity:0; transform:translateY(-4px); transition:opacity .16s ease, transform .16s ease; }
  .media-frame:hover .expand, .video-card:hover .expand { opacity:1; transform:translateY(0); }
  .video-card { position:relative; border:1px solid var(--content-border); border-radius:15px; padding:4px; background:var(--button); transition:transform .18s ease; }
  .video-card:hover { transform:translateY(-1px); }
  .video-card video { border-radius:12px; background:#000; width:min(390px, 70vw); max-height:380px; display:block; }
  .video-badge { position:absolute; left:12px; top:12px; display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:999px; background:rgba(0,0,0,.56); color:#fff; font-size:11px; font-weight:600; }
  .video-badge svg { width:13px; height:13px; }
  .voice-card, .audio-card, .doc-card { display:flex; align-items:center; gap:11px; min-width:min(300px, 68vw); padding:10px; border-radius:14px; background:var(--button); border:1px solid var(--button-stroke); color:inherit; text-decoration:none; }
  .out .voice-card, .out .audio-card, .out .doc-card { background:rgba(255,255,255,.14); border-color:rgba(255,255,255,.18); }
  .voice-mark, .doc-mark { width:38px; height:38px; border-radius:12px; display:grid; place-items:center; flex:none; background:var(--primary); color:var(--secondary); box-shadow:0 0 0 1px var(--button-stroke) inset; }
  .out .voice-mark, .out .doc-mark { background:rgba(255,255,255,.18); color:#fff; }
  .wave { display:flex; align-items:center; gap:3px; height:26px; flex:1; min-width:62px; }
  .wave i { display:block; width:3px; border-radius:999px; background:currentColor; transform-origin:center; animation:soft-pulse 1.45s ease-in-out infinite; }
  .wave i:nth-child(1) { height:10px; animation-delay:0s; } .wave i:nth-child(2) { height:18px; animation-delay:.08s; } .wave i:nth-child(3) { height:24px; animation-delay:.16s; }
  .wave i:nth-child(4) { height:14px; animation-delay:.24s; } .wave i:nth-child(5) { height:22px; animation-delay:.32s; } .wave i:nth-child(6) { height:12px; animation-delay:.40s; }
  .voice-card audio, .audio-card audio { width:142px; max-width:36vw; height:30px; }
  .doc-title { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; }
  .doc-sub { color:var(--gray); font-size:12px; }
  .out .doc-sub { color:rgba(255,255,255,.72); }
  .album-grid { display:grid; grid-template-columns:repeat(2, minmax(108px, 1fr)); gap:5px; max-width:340px; }
  .album-grid .media-frame, .album-grid .video-card { max-width:none; }
  .album-grid img, .album-grid video { height:142px; max-height:142px; }
  .keyboard { display:flex; flex-direction:column; gap:5px; margin-top:8px; min-width:min(280px, 58vw); }
  .keyboard-row { display:flex; gap:5px; }
  .key { flex:1; min-width:0; display:flex; align-items:center; justify-content:center; gap:6px; padding:7px 9px; border-radius:11px; border:1px solid var(--content-border); background:var(--primary); color:inherit; font-size:12.5px; font-weight:600; text-decoration:none; transition:background .16s ease, transform .16s ease; }
  .out .key { background:rgba(255,255,255,.14); border-color:rgba(255,255,255,.18); }
  .key:hover { background:var(--button-hover); transform:translateY(-1px); }
  .out .key:hover { background:rgba(255,255,255,.2); }
  .key span:last-child { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .key svg { width:13px; height:13px; opacity:.82; }
  .eventline { align-self:center; max-width:min(520px, 86%); display:flex; align-items:center; gap:9px; padding:7px 12px; border:1px solid var(--content-border); border-radius:999px; background:var(--sidebar-bg); color:var(--gray); font-size:12.5px; animation:msg-in .22s ease both; }
  .eventline .event-title { color:var(--secondary); font-weight:600; }
  .eventline svg { width:14px; height:14px; color:var(--blue); }

  #composer { flex:none; display:flex; align-items:center; gap:10px; padding:14px 18px; border-top:1px solid var(--content-border); background:var(--primary); }
  #composer input.text { flex:1; height:44px; min-width:0; background:var(--button); border:1px solid var(--button-stroke); color:var(--secondary); border-radius:15px; padding:0 14px; outline:none; transition:border-color .16s ease, box-shadow .16s ease, background .16s ease; }
  #composer input.text:focus { background:var(--primary); border-color:var(--blue); box-shadow:0 0 0 4px color-mix(in srgb, var(--blue) 14%, transparent); }
  #composer button { height:44px; border:0; border-radius:15px; cursor:pointer; transition:background .16s ease, transform .16s ease, opacity .16s ease; }
  #composer button:active { transform:scale(.98); }
  #composer .attach { width:44px; background:var(--button); color:var(--button-text); box-shadow:0 0 0 1px var(--button-stroke) inset; display:grid; place-items:center; }
  #composer .attach:hover { background:var(--button-hover); }
  #composer .send { display:inline-flex; align-items:center; gap:8px; padding:0 17px; font-weight:600; background:var(--secondary); color:var(--primary); }
  #composer .send:hover { opacity:.86; }

  #viewer[hidden] { display:none; }
  #viewer { position:fixed; inset:0; z-index:20; display:grid; place-items:center; padding:22px; background:rgba(0,0,0,.72); animation:viewer-in .18s ease both; }
  #viewer .viewer-card { max-width:min(980px, 100%); max-height:100%; display:flex; flex-direction:column; gap:12px; animation:rise-in .22s ease both; }
  #viewer .viewer-top { display:flex; justify-content:flex-end; }
  #viewer .viewer-close { width:40px; height:40px; border:1px solid rgba(255,255,255,.16); border-radius:14px; background:rgba(255,255,255,.08); color:#fff; display:grid; place-items:center; cursor:pointer; }
  #viewer .viewer-frame { display:grid; place-items:center; min-height:0; }
  #viewer img, #viewer video { max-width:100%; max-height:78vh; border-radius:18px; box-shadow:var(--shadow); background:#000; }
  #viewer .viewer-caption { color:rgba(255,255,255,.82); text-align:center; max-width:760px; }

  @media (max-width: 780px) {
    #chats { width:100%; }
    #main { display:none; }
    body.chat-open #chats { display:none; }
    body.chat-open #main { display:flex; }
    .back { display:grid; }
    .msg { max-width:88%; }
    #log { padding:16px 14px; }
    #composer { padding:10px; }
    #composer .send span:last-child { display:none; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration:.001ms !important; animation-iteration-count:1 !important; transition-duration:.001ms !important; scroll-behavior:auto !important; }
  }
</style>
</head>
<body>
<form id="login">
  <div class="card">
    <div class="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z"/><path d="M8.5 10.5h7M8.5 14h4.25"/></svg></div>
    <div class="brand"><b>@yaebal</b>/panel</div>
    <div class="sub">secure operator console</div>
    <input id="token" type="password" placeholder="access token" autocomplete="off" autofocus />
    <button id="go" type="submit">authorize</button>
    <div class="err" id="err"></div>
  </div>
</form>

<div id="app">
  <aside id="chats">
    <div class="side-top">
      <div class="side-title">
        <div class="side-logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z"/><path d="M8.5 10.5h7M8.5 14h4.25"/></svg></div>
        <div><h1>operator panel</h1><p>live private chats</p></div>
      </div>
      <button id="logout" class="ghost" type="button" aria-label="log out"></button>
    </div>
    <div id="chat-list"></div>
  </aside>
  <main id="main"><div id="empty"><div class="empty-card"><div class="empty-icon"></div><div>select a chat</div></div></div></main>
</div>

<div id="viewer" hidden>
  <div class="viewer-card">
    <div class="viewer-top"><button class="viewer-close" type="button" aria-label="close viewer"></button></div>
    <div class="viewer-frame"></div>
    <div class="viewer-caption"></div>
  </div>
</div>

<script>
const BASE = "__BASE__";
const KEY = "yaebal-panel-token" + BASE;
let token = sessionStorage.getItem(KEY) || "";
let active = null, oldest = null, es = null, chatsCache = [];

const ICONS = {
  logout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M10 6H6.8A1.8 1.8 0 0 0 5 7.8v8.4A1.8 1.8 0 0 0 6.8 18H10"/><path d="M14 8l4 4-4 4"/><path d="M18 12H9"/></svg>',
  empty:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 7.5A3.5 3.5 0 0 1 8.5 4h7A3.5 3.5 0 0 1 19 7.5v4A3.5 3.5 0 0 1 15.5 15H12l-4.2 3.6V15A3.5 3.5 0 0 1 5 11.5v-4Z"/></svg>',
  attach:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="m8.5 12.5 5.9-5.9a3.2 3.2 0 0 1 4.5 4.5l-7.1 7.1a4.6 4.6 0 0 1-6.5-6.5l7.3-7.3"/><path d="m9.5 15.1 7-7"/></svg>',
  send:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M20 4 10.6 20l-1.8-7.2L4 10.5 20 4Z"/><path d="m8.8 12.8 5.4-3.5"/></svg>',
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M15 6 9 12l6 6"/></svg>',
  close:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  image:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="5" width="16" height="14" rx="3"/><path d="m7 16 3.5-3.5 2.7 2.7 1.8-1.8L18 16"/><circle cx="9" cy="9" r="1.2"/></svg>',
  video:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="6" width="11" height="12" rx="3"/><path d="m15 10 5-3v10l-5-3"/></svg>',
  mic:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="4" width="6" height="10" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  audio:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18V7l10-2v11"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>',
  file:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 3h6l4 4v14H7z"/><path d="M13 3v5h5M9.5 13h5M9.5 16h5"/></svg>',
  sticker:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 4h12v9l-6 7H6z"/><path d="M12 20v-7h6M9 9h.01M14 9h.01"/></svg>',
  callback:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="7" width="16" height="10" rx="4"/><path d="M8 12h8"/></svg>',
  event:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v3M12 18v3M4.6 7.5l2.6 1.5M16.8 15l2.6 1.5M4.6 16.5 7.2 15M16.8 9l2.6-1.5"/><circle cx="12" cy="12" r="3.2"/></svg>',
  keyboard:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="6" width="16" height="12" rx="3"/><path d="M7 10h.01M10.5 10h.01M14 10h.01M17.5 10h.01M7 14h7M16.5 14h.01"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>',
  link:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 13a4 4 0 0 0 5.7 0l2-2a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 11a4 4 0 0 0-5.7 0l-2 2A4 4 0 0 0 12 18.7l1-1"/></svg>',
  user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>'
};

const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const icon = (name, c) => { const s = el("span", "ico" + (c ? " " + c : "")); s.innerHTML = ICONS[name] || ICONS.file; return s; };
const api = (p, opt = {}) => fetch(BASE + p, { ...opt, headers: { ...(opt.headers||{}), authorization: "Bearer " + token } });

document.getElementById("logout").append(icon("logout"));
document.querySelector("#empty .empty-icon").append(icon("empty"));
document.querySelector(".viewer-close").append(icon("close"));

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
  sessionStorage.removeItem(KEY); token = ""; active = null; chatsCache = [];
  if (es) { es.close(); es = null; }
  document.body.classList.remove("authed", "chat-open");
  document.getElementById("token").value = "";
};

function enter() { document.body.classList.add("authed"); loadChats(); openStream(); }
function openStream() {
  if (es || !window.EventSource) return;
  es = new EventSource(BASE + "/api/stream?token=" + encodeURIComponent(token));
  es.addEventListener("record", (ev) => {
    const e = JSON.parse(ev.data);
    if (active && e.chatId === active) openChat(active, true);
    loadChats();
  });
  es.onerror = () => {};
}
setInterval(() => { if (token) (active ? openChat(active, true) : loadChats()); }, 8000);

function displayName(c) {
  const full = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return full || (c.username ? "@" + c.username : c.name || "chat " + c.id);
}
function handleName(c) {
  if (c.username) return "@" + c.username;
  const name = displayName(c);
  return c.name && c.name !== name ? c.name : "";
}
function avatar(c, small) {
  const a = el("div", "avatar" + (small ? " small" : ""));
  a.append(icon("user"));
  return a;
}
function time(ts) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
}
const isPlaceholder = (t) => /^\\[[a-z_]+\\]$/.test(t || "");
const placeholderKind = (t) => { const m = /^\\[([a-z_]+)\\]$/.exec(t || ""); return m && m[1]; };
function mediaIcon(type) {
  if (type === "photo") return "image";
  if (type === "video" || type === "animation" || type === "video_note") return "video";
  if (type === "voice") return "mic";
  if (type === "audio") return "audio";
  if (type === "sticker") return "sticker";
  return "file";
}
function mediaLabel(type) { return String(type || "media").replace(/_/g, " "); }
function eventIcon(type) { return type === "callback" ? "callback" : "event"; }

async function loadChats() {
  const res = await api("/api/chats"); if (!res.ok) return;
  chatsCache = await res.json();
  const box = document.getElementById("chat-list");
  box.innerHTML = "";
  for (const c of chatsCache) box.append(chatRow(c));
}
function chatRow(c) {
  const row = el("button", "chat" + (c.id === active ? " on" : "")); row.type = "button";
  row.append(avatar(c));
  const body = el("div", "chat-body");
  const line = el("div", "chat-line");
  line.append(el("div", "chat-name", displayName(c)), el("div", "chat-time", time(c.lastDate)));
  body.append(line);
  const handle = handleName(c); if (handle) body.append(el("div", "chat-handle", handle));
  const preview = el("div", "preview");
  const kind = c.lastAttachmentType || placeholderKind(c.lastText);
  if (c.lastEventType) {
    preview.append(icon(eventIcon(c.lastEventType)), el("span", "preview-label", "event"), el("span", "preview-text", c.lastText));
  } else if (kind) {
    const caption = isPlaceholder(c.lastText) ? "" : c.lastText;
    preview.append(icon(mediaIcon(kind)), el("span", "preview-label", mediaLabel(kind)), el("span", "preview-text", caption || "media message"));
  } else {
    preview.append(el("span", "preview-text", c.lastText || "message"));
  }
  body.append(preview);
  row.append(body);
  row.onclick = () => openChat(c.id);
  return row;
}
function chatById(id) { return chatsCache.find((c) => c.id === id) || { id, name:"chat " + id, lastText:"", lastDate:0 }; }

const fileSrc = (att) => BASE + "/api/file?id=" + encodeURIComponent(att.fileId) + "&token=" + encodeURIComponent(token);
function attEl(att, caption) {
  const src = fileSrc(att);
  if (att.type === "photo" || att.type === "sticker") {
    const btn = el("button", "media-frame image"); btn.type = "button";
    const img = el("img"); img.src = src; img.loading = "lazy"; img.alt = att.type;
    btn.append(img, el("span", "expand")); btn.querySelector(".expand").append(icon("search"));
    btn.onclick = () => openViewer(att, caption);
    return btn;
  }
  if (att.type === "video" || att.type === "animation" || att.type === "video_note") {
    const box = el("div", "video-card");
    const v = el("video"); v.src = src; v.controls = true; v.preload = "metadata";
    const badge = el("div", "video-badge"); badge.append(icon("video"), el("span", null, mediaLabel(att.type)));
    const expand = el("button", "expand"); expand.type = "button"; expand.append(icon("search")); expand.onclick = () => openViewer(att, caption);
    box.append(v, badge, expand);
    return box;
  }
  if (att.type === "voice") {
    const card = el("div", "voice-card");
    const mark = el("div", "voice-mark"); mark.append(icon("mic"));
    const wave = el("div", "wave"); for (let i = 0; i < 6; i++) wave.append(el("i"));
    const a = el("audio"); a.src = src; a.controls = true; a.preload = "metadata";
    card.append(mark, wave, a);
    return card;
  }
  if (att.type === "audio") {
    const card = el("div", "audio-card");
    const mark = el("div", "voice-mark"); mark.append(icon("audio"));
    const a = el("audio"); a.src = src; a.controls = true; a.preload = "metadata";
    card.append(mark, a);
    return card;
  }
  const link = el("a", "doc-card"); link.href = src; link.target = "_blank"; link.rel = "noreferrer";
  const mark = el("div", "doc-mark"); mark.append(icon("file"));
  const meta = el("div"); meta.append(el("div", "doc-title", att.fileName || mediaLabel(att.type)), el("div", "doc-sub", att.mimeType || "telegram file"));
  link.append(mark, meta);
  return link;
}
function keyboardEl(k) {
  const box = el("div", "keyboard");
  for (const row of k.rows || []) {
    const r = el("div", "keyboard-row");
    for (const b of row) {
      const node = b.url ? el("a", "key") : el("div", "key");
      if (b.url) { node.href = b.url; node.target = "_blank"; node.rel = "noreferrer"; }
      node.append(icon(b.kind === "url" ? "link" : "keyboard"), el("span", null, b.text));
      r.append(node);
    }
    box.append(r);
  }
  return box;
}
function eventBubble(m) {
  const e = el("div", "eventline");
  e.append(icon(eventIcon(m.event.type)), el("span", "event-title", m.event.title));
  if (m.event.detail) e.append(el("span", null, m.event.detail));
  return e;
}
function bubble(m) {
  if (m.event) return eventBubble(m);
  const wrap = el("div", "msg " + m.direction);
  const card = el("div", "bubble");
  const atts = m.attachments || [];
  if (m.mediaGroupId && atts.length) {
    const grid = el("div", "album-grid");
    for (const a of atts) grid.append(attEl(a, m.text));
    card.append(grid);
  } else {
    for (const a of atts) card.append(attEl(a, m.text));
  }
  if (m.text && !(atts.length && isPlaceholder(m.text))) card.append(el("div", atts.length ? "cap" : "cap", m.text));
  if (m.keyboard) card.append(keyboardEl(m.keyboard));
  wrap.append(card, el("div", "time", time(m.date)));
  return wrap;
}
function addToAlbum(node, m) {
  const grid = node.querySelector(".album-grid"); if (!grid) return;
  for (const a of m.attachments || []) grid.append(attEl(a, m.text));
  if (m.text && !isPlaceholder(m.text)) node.querySelector(".bubble").append(el("div", "cap", m.text));
}
function renderMsgs(msgs) {
  const out = [];
  let group = null, groupId = null;
  for (const m of msgs) {
    if (!m.event && m.mediaGroupId && m.mediaGroupId === groupId && group) { addToAlbum(group, m); continue; }
    const b = bubble(m);
    if (!m.event && m.mediaGroupId) { group = b; groupId = m.mediaGroupId; }
    else { group = null; groupId = null; }
    out.push(b);
  }
  return out;
}

async function openChat(id, keepScroll) {
  active = id; document.body.classList.add("chat-open");
  if (!keepScroll) loadChats();
  const res = await api("/api/chats/" + id + "?limit=200"); if (!res.ok) return;
  const msgs = await res.json(); oldest = msgs.length ? msgs[0].date : null;
  const c = chatById(id);
  const main = document.getElementById("main");
  const prevTop = keepScroll ? (main.querySelector("#log")?.scrollTop ?? null) : null;
  main.innerHTML = "";

  const head = el("div", "thread-head");
  const back = el("button", "ghost back"); back.type = "button"; back.append(icon("back")); back.onclick = () => { document.body.classList.remove("chat-open"); };
  const meta = el("div", "meta"); meta.append(el("div", "name", displayName(c)), el("div", "sub", handleName(c) || "private chat"));
  head.append(back, avatar(c, true), meta);
  const log = el("div"); log.id = "log";
  if (msgs.length >= 200) { const more = el("button", "more", "load earlier"); more.onclick = () => loadEarlier(id, log); log.append(more); }
  for (const b of renderMsgs(msgs)) log.append(b);

  const form = el("form"); form.id = "composer";
  const fileInput = el("input"); fileInput.type = "file"; fileInput.style.display = "none";
  const attach = el("button", "attach"); attach.type = "button"; attach.title = "send a file"; attach.append(icon("attach")); attach.onclick = () => fileInput.click();
  const input = el("input", "text"); input.placeholder = "reply..."; input.autocomplete = "off";
  const btn = el("button", "send"); btn.type = "submit"; btn.append(icon("send"), el("span", null, "send"));
  form.append(attach, fileInput, input, btn);

  fileInput.onchange = async () => {
    const file = fileInput.files && fileInput.files[0]; if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    if (input.value.trim()) fd.append("caption", input.value.trim());
    input.value = ""; fileInput.value = "";
    await api("/api/chats/" + id + "/send", { method: "POST", body: fd });
    openChat(id);
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim(); if (!text) return;
    input.value = "";
    await api("/api/chats/" + id + "/send", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({ text }) });
    openChat(id);
  };
  main.append(head, log, form);
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
  log.querySelector(".more")?.remove(); log.insertBefore(frag, anchor);
}

function openViewer(att, caption) {
  const viewer = document.getElementById("viewer"), frame = viewer.querySelector(".viewer-frame"), cap = viewer.querySelector(".viewer-caption");
  frame.innerHTML = ""; cap.textContent = caption && !isPlaceholder(caption) ? caption : "";
  const src = fileSrc(att);
  if (att.type === "video" || att.type === "animation" || att.type === "video_note") {
    const v = el("video"); v.src = src; v.controls = true; v.autoplay = true; frame.append(v);
  } else {
    const img = el("img"); img.src = src; img.alt = att.type; frame.append(img);
  }
  viewer.hidden = false;
}
function closeViewer() { document.getElementById("viewer").hidden = true; }
document.querySelector(".viewer-close").onclick = closeViewer;
document.getElementById("viewer").onclick = (e) => { if (e.target.id === "viewer") closeViewer(); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeViewer(); });

if (token) enter();
</script>
</body>
</html>`;
