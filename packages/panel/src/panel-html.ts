/** the operator panel ui - a single static page: cookie-session login, then the live chat view. */
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
    --blue:#2f8af9; --red:#ed2236; --green:#1fa971; --amber:#c98a12;
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
      --blue:#2a7ce1; --red:#ff5b70; --green:#33c98a; --amber:#e0a939;
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
  @keyframes spin { to { transform:rotate(360deg); } }

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

  .side-top { flex:none; padding:16px 16px 12px; display:flex; align-items:center; justify-content:space-between; gap:10px; border-bottom:1px solid var(--sidebar-stroke); }
  .side-title { min-width:0; display:flex; align-items:center; gap:12px; }
  .side-logo { width:38px; height:38px; border-radius:13px; display:grid; place-items:center; background:var(--secondary); color:var(--primary); flex:none; }
  .side-logo svg { width:18px; height:18px; }
  .side-title h1 { font-size:15px; font-weight:600; letter-spacing:-.3px; }
  .side-title p { margin-top:1px; color:var(--gray); font-size:12.5px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .side-actions { display:flex; align-items:center; gap:6px; flex:none; }
  .ghost { width:34px; height:34px; padding:0; border:0; border-radius:12px; display:grid; place-items:center; background:var(--button); color:var(--button-text); box-shadow:0 0 0 1px var(--button-stroke) inset; cursor:pointer; transition:background .16s ease, transform .16s ease; position:relative; }
  .ghost:hover { background:var(--button-hover); }
  .ghost:active { transform:scale(.97); }
  .ghost.on { background:var(--blue); color:#fff; box-shadow:none; }

  .search-wrap { flex:none; padding:10px 12px 0; }
  .search-box { display:flex; align-items:center; gap:8px; padding:0 11px; height:36px; border-radius:11px; background:var(--button); box-shadow:0 0 0 1px var(--button-stroke) inset; color:var(--gray); }
  .search-box .ico svg { width:15px; height:15px; }
  .search-box input { flex:1; min-width:0; border:0; background:transparent; outline:none; color:var(--secondary); font-size:13px; }
  .filters { display:flex; gap:6px; padding:10px 12px 4px; flex:none; overflow-x:auto; }
  .filter-btn { flex:none; border:0; padding:5px 11px; border-radius:999px; background:var(--button); color:var(--gray); font-size:12px; font-weight:600; cursor:pointer; transition:background .14s ease, color .14s ease; }
  .filter-btn:hover { background:var(--button-hover); }
  .filter-btn.on { background:var(--secondary); color:var(--primary); }

  #chat-list { flex:1; min-height:0; overflow:auto; padding:8px 8px 10px; }
  .chat { width:100%; border:0; background:transparent; color:inherit; display:grid; grid-template-columns:42px 1fr; gap:11px; padding:9px 10px; border-radius:13px; text-align:left; cursor:pointer; animation:slide-in .24s ease both; transition:background .16s ease, color .16s ease, transform .16s ease; }
  .chat:hover { background:var(--button-hover); }
  .chat:active { transform:scale(.99); }
  .chat.on { background:var(--secondary); color:var(--primary); }
  .avatar { position:relative; width:42px; height:42px; border-radius:13px; display:grid; place-items:center; background:var(--button); color:var(--button-text); box-shadow:0 0 0 1px var(--button-stroke) inset; flex:none; }
  .chat.on .avatar { background:var(--primary); color:var(--secondary); }
  .avatar.small { width:38px; height:38px; border-radius:12px; }
  .avatar svg { width:18px; height:18px; }
  .status-dot { position:absolute; right:-2px; bottom:-2px; width:11px; height:11px; border-radius:50%; border:2px solid var(--sidebar-bg); background:var(--blue); }
  .status-dot.handled { background:var(--green); }
  .status-dot.archived { background:var(--gray); }
  .chat.on .status-dot { border-color:var(--secondary); }
  .chat-body { min-width:0; align-self:center; }
  .chat-line { display:flex; align-items:baseline; justify-content:space-between; gap:8px; min-width:0; }
  .chat-name-wrap { display:flex; align-items:center; gap:5px; min-width:0; }
  .chat-name { font-weight:600; letter-spacing:-.2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .pin-mark svg { width:11px; height:11px; color:var(--gray); flex:none; }
  .chat.on .pin-mark svg { color:color-mix(in srgb, var(--primary) 70%, transparent); }
  .chat-handle { color:var(--gray); font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:1px; }
  .chat.on .chat-handle, .chat.on .chat-time, .chat.on .preview { color:color-mix(in srgb, var(--primary) 70%, transparent); }
  .chat-time { color:var(--gray); font-size:11.5px; flex:none; }
  .preview { min-width:0; display:flex; align-items:center; justify-content:space-between; gap:6px; margin-top:4px; color:var(--gray); }
  .preview-main { min-width:0; display:flex; align-items:center; gap:5px; }
  .preview .ico svg { width:13px; height:13px; }
  .preview-label { font-weight:600; font-size:12px; flex:none; color:inherit; }
  .preview-text { min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:12.5px; }
  .unread-badge { flex:none; min-width:18px; height:18px; padding:0 5px; border-radius:999px; background:var(--blue); color:#fff; font-size:11px; font-weight:700; display:grid; place-items:center; }
  .chat.on .unread-badge { background:var(--primary); color:var(--secondary); }

  #empty { flex:1; display:grid; place-items:center; color:var(--gray); animation:fade-in .22s ease both; }
  #empty .empty-card { text-align:center; padding:28px; }
  #empty .empty-icon { width:58px; height:58px; border:1px solid var(--content-border); border-radius:18px; display:grid; place-items:center; margin:0 auto 14px; background:var(--sidebar-bg); }
  #empty svg { width:26px; height:26px; color:var(--gray); }
  .thread-head { flex:none; min-height:68px; padding:12px 20px; display:flex; align-items:center; gap:12px; border-bottom:1px solid var(--content-border); background:var(--primary); flex-wrap:wrap; row-gap:8px; }
  .thread-head .meta { min-width:0; flex:1; }
  .thread-head .name { font-weight:600; letter-spacing:-.25px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .thread-head .sub { color:var(--gray); font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .thread-controls { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
  .status-pill { border:1px solid var(--content-border); background:var(--button); color:var(--gray); font-size:11.5px; font-weight:700; padding:5px 10px; border-radius:999px; cursor:pointer; transition:background .14s ease, color .14s ease, border-color .14s ease; }
  .status-pill:hover { background:var(--button-hover); }
  .status-pill.on[data-status="open"] { background:var(--blue); color:#fff; border-color:transparent; }
  .status-pill.on[data-status="handled"] { background:var(--green); color:#fff; border-color:transparent; }
  .status-pill.on[data-status="archived"] { background:var(--gray); color:#fff; border-color:transparent; }
  .assign-chip { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--gray); }
  .assign-chip b { color:var(--secondary); font-weight:600; }
  .assign-chip button { border:0; background:var(--button); color:var(--button-text); font-size:11.5px; font-weight:600; padding:5px 9px; border-radius:999px; cursor:pointer; }
  .assign-chip button:hover { background:var(--button-hover); }
  .back { display:none; }
  #log { flex:1; min-height:0; overflow:auto; padding:22px 24px; display:flex; flex-direction:column; gap:8px; }
  #log .more { align-self:center; border:1px solid var(--content-border); border-radius:999px; background:var(--sidebar-bg); color:var(--gray); padding:6px 13px; cursor:pointer; font-size:12px; transition:border-color .16s ease, color .16s ease; }
  #log .more:hover { border-color:var(--blue); color:var(--secondary); }
  .msg { display:flex; flex-direction:column; max-width:min(560px, 72%); gap:4px; animation:msg-in .22s ease both; }
  .msg.in { align-self:flex-start; transform-origin:left bottom; }
  .msg.out { align-self:flex-end; align-items:flex-end; transform-origin:right bottom; }
  .bubble { position:relative; border:1px solid var(--content-border); border-radius:16px; padding:9px 11px; background:var(--sidebar-bg); color:var(--secondary); cursor:pointer; }
  .out .bubble { border-color:var(--blue); background:var(--blue); color:var(--white); }
  .bubble.deleted { opacity:.6; font-style:italic; }
  .cap { padding:3px 0 0; white-space:pre-wrap; word-break:break-word; }
  .reply-strip { display:flex; align-items:center; gap:5px; padding:3px 7px; margin-bottom:4px; border-left:2px solid currentColor; opacity:.75; font-size:11.5px; border-radius:0 6px 6px 0; background:rgba(127,127,127,.1); }
  .meta-row { display:flex; align-items:center; gap:6px; padding:0 4px; }
  .time { color:var(--gray); font-size:11.5px; }
  .out .time { color:var(--gray); }
  .operator-tag { color:var(--gray); font-size:11px; font-weight:600; }
  .edited-tag { color:var(--gray); font-size:11px; font-style:italic; }
  .actions-bar { display:none; gap:4px; margin-top:6px; }
  .actions-bar.open { display:flex; }
  .actions-bar button { border:0; background:var(--button); color:var(--button-text); font-size:11.5px; font-weight:600; padding:5px 9px; border-radius:9px; cursor:pointer; display:flex; align-items:center; gap:5px; }
  .actions-bar button:hover { background:var(--button-hover); }
  .actions-bar button.danger { color:var(--red); }

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

  #composer { flex:none; display:flex; flex-direction:column; border-top:1px solid var(--content-border); background:var(--primary); }
  .compose-banner { display:none; align-items:center; justify-content:space-between; gap:10px; padding:8px 16px; font-size:12.5px; color:var(--gray); border-bottom:1px solid var(--content-border); }
  .compose-banner.show { display:flex; }
  .compose-banner b { color:var(--secondary); }
  .compose-banner button { border:0; background:transparent; color:var(--gray); cursor:pointer; padding:2px; }
  .compose-row { display:flex; align-items:center; gap:10px; padding:14px 18px; position:relative; }
  #composer input.text { flex:1; height:44px; min-width:0; background:var(--button); border:1px solid var(--button-stroke); color:var(--secondary); border-radius:15px; padding:0 14px; outline:none; transition:border-color .16s ease, box-shadow .16s ease, background .16s ease; }
  #composer input.text:focus { background:var(--primary); border-color:var(--blue); box-shadow:0 0 0 4px color-mix(in srgb, var(--blue) 14%, transparent); }
  #composer button { height:44px; border:0; border-radius:15px; cursor:pointer; transition:background .16s ease, transform .16s ease, opacity .16s ease; }
  #composer button:active { transform:scale(.98); }
  #composer .attach, #composer .canned-btn { width:44px; background:var(--button); color:var(--button-text); box-shadow:0 0 0 1px var(--button-stroke) inset; display:grid; place-items:center; flex:none; }
  #composer .attach:hover, #composer .canned-btn:hover { background:var(--button-hover); }
  #composer .send { display:inline-flex; align-items:center; gap:8px; padding:0 17px; font-weight:600; background:var(--secondary); color:var(--primary); flex:none; }
  #composer .send:hover { opacity:.86; }
  #composer button:disabled, #composer input:disabled { opacity:.55; cursor:wait; }
  .spinner { display:none; width:15px; height:15px; flex:none; border-radius:50%; border:2px solid rgba(255,255,255,.35); border-top-color:#fff; animation:spin .65s linear infinite; }
  .attach .spinner { border-color:var(--button-stroke); border-top-color:var(--button-text); }
  .loading .spinner { display:block; }
  .loading .ico, .loading span:last-child { display:none; }
  .compose-error { padding:0 18px 10px; color:var(--red); font-size:12px; display:none; }
  .compose-error.show { display:block; }
  .canned-pop { position:absolute; bottom:60px; left:18px; width:min(320px, calc(100vw - 40px)); max-height:260px; overflow:auto; border:1px solid var(--content-border); border-radius:14px; background:var(--sidebar-bg); box-shadow:var(--shadow); padding:6px; display:none; z-index:5; }
  .canned-pop.show { display:block; }
  .canned-item { width:100%; text-align:left; border:0; background:transparent; padding:8px 10px; border-radius:10px; cursor:pointer; }
  .canned-item:hover { background:var(--button-hover); }
  .canned-item .label { font-weight:600; font-size:12.5px; }
  .canned-item .text { color:var(--gray); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

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
    .compose-row { padding:10px; }
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
        <div><h1>operator panel</h1><p id="who">live private chats</p></div>
      </div>
      <div class="side-actions">
        <button id="notify" class="ghost" type="button" title="desktop notifications" aria-label="toggle notifications"></button>
        <button id="logout" class="ghost" type="button" aria-label="log out"></button>
      </div>
    </div>
    <div class="search-wrap">
      <div class="search-box"></div>
    </div>
    <div class="filters"></div>
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
let operatorName = null;
let active = null, renderedChatId = null, renderedBySeq = new Map();
let oldest = null; // { date, seq } | null
let es = null, chatsCache = [], cannedCache = [];
let chatFilter = "all", searchQuery = "", searchTimer = null;
let composeReplyTo = null, composeEditing = null, typingTimer = null;
let notifyOn = false;

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
  user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>',
  pin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="9" r="4"/><path d="M12 13v9"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 7h14M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M7 7l1 13a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-13"/></svg>',
  download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>',
  edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="M13.5 6.5l3 3"/></svg>',
  more:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 6v.01M12 12v.01M12 18v.01"/></svg>',
  reply:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 7 4 12l5 5"/><path d="M4 12h11a4 4 0 0 1 4 4v1"/></svg>',
  bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 8a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>',
  copy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>'
};

const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const icon = (name, c) => { const s = el("span", "ico" + (c ? " " + c : "")); s.innerHTML = ICONS[name] || ICONS.file; return s; };
const api = (p, opt = {}) => fetch(BASE + p, opt);
const postJSON = (p, body) => api(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });

document.getElementById("logout").append(icon("logout"));
document.getElementById("notify").append(icon("bell"));
document.querySelector("#empty .empty-icon").append(icon("empty"));
document.querySelector(".viewer-close").append(icon("close"));

const searchBox = document.querySelector(".search-box");
searchBox.append(icon("search"));
const searchInput = el("input"); searchInput.placeholder = "search chats & messages"; searchInput.autocomplete = "off";
searchBox.append(searchInput);
searchInput.oninput = () => {
  clearTimeout(searchTimer);
  searchQuery = searchInput.value.trim();
  searchTimer = setTimeout(renderSidebar, 220);
};

const filtersBar = document.querySelector(".filters");
for (const f of [["all", "all"], ["open", "open"], ["handled", "handled"], ["archived", "archived"]]) {
  const btn = el("button", "filter-btn" + (f[0] === chatFilter ? " on" : ""), f[1]);
  btn.type = "button";
  btn.onclick = () => { chatFilter = f[0]; for (const b of filtersBar.children) b.classList.toggle("on", b === btn); loadChats(); };
  filtersBar.append(btn);
}

const login = document.getElementById("login");
login.onsubmit = async (e) => {
  e.preventDefault();
  const go = document.getElementById("go"), err = document.getElementById("err");
  const token = document.getElementById("token").value.trim();
  if (!token) return;
  go.disabled = true; err.textContent = "";
  const res = await postJSON("/api/login", { token }).catch(() => null);
  go.disabled = false;
  if (!res || !res.ok) { err.textContent = "invalid token"; return; }
  const data = await res.json();
  operatorName = data.operator;
  enter();
};
document.getElementById("logout").onclick = async () => {
  await api("/api/logout", { method: "POST" }).catch(() => {});
  forceLogout();
};
function forceLogout() {
  operatorName = null; active = null; renderedChatId = null; chatsCache = [];
  if (es) { es.close(); es = null; }
  document.body.classList.remove("authed", "chat-open");
  document.getElementById("token").value = "";
}

document.getElementById("notify").onclick = async () => {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return;
  }
  notifyOn = !notifyOn;
  document.getElementById("notify").classList.toggle("on", notifyOn);
};

async function checkSession() {
  const res = await api("/api/session").catch(() => null);
  if (!res || !res.ok) return null;
  const data = await res.json();
  return data.operator;
}

function enter() {
  document.body.classList.add("authed");
  document.getElementById("who").textContent = "logged in as " + operatorName;
  loadCanned();
  loadChats();
  openStream();
}

function openStream() {
  if (es || !window.EventSource) return;
  es = new EventSource(BASE + "/api/stream");
  // only "record" ever changes a chat's message content — "status"/"read"/"chat" just
  // touch metadata, so they only need to refresh the sidebar. calling appendIncoming()
  // for those too used to create a feedback loop: opening a chat marks it read, which
  // broadcast a "read" event, which every listening tab treated as "refetch this chat",
  // and refetching a chat marks it read again — an unbounded request storm.
  es.addEventListener("record", (ev) => {
    let data = {};
    try { data = JSON.parse(ev.data); } catch {}
    if (data.direction === "in" && notifyOn && data.chatId !== active && "Notification" in window && Notification.permission === "granted") {
      const chat = chatsCache.find((c) => c.id === data.chatId);
      new Notification("new message", { body: chat ? displayName(chat) : "chat " + data.chatId });
    }
    if (data.chatId != null && active != null && data.chatId === active) appendIncoming(active);
    loadChats();
  });
  es.addEventListener("status", loadChats);
  es.addEventListener("read", loadChats);
  es.addEventListener("chat", loadChats);
  es.addEventListener("deleted", (ev) => {
    let chatId = null;
    try { chatId = JSON.parse(ev.data).chatId; } catch {}
    if (chatId != null && chatId === active) { active = null; renderedChatId = null; document.body.classList.remove("chat-open"); showEmpty(); }
    loadChats();
  });
  // EventSource retries forever on any error, including an expired session — if the
  // session actually died, stop retrying and force the operator back to the login screen
  // instead of silently spinning (this is what used to make a stale session unrecoverable).
  es.onerror = async () => {
    const op = await checkSession();
    if (!op) { es.close(); es = null; forceLogout(); }
  };
}

function showEmpty() {
  document.getElementById("main").innerHTML = "";
  const wrap = el("div"); wrap.id = "empty";
  const card = el("div", "empty-card"); const iconWrap = el("div", "empty-icon"); iconWrap.append(icon("empty"));
  card.append(iconWrap, el("div", null, "select a chat")); wrap.append(card);
  document.getElementById("main").append(wrap);
}

async function loadCanned() {
  const res = await api("/api/canned").catch(() => null);
  cannedCache = res && res.ok ? await res.json() : [];
}

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
  if (!small && c.status) {
    const dot = el("span", "status-dot " + c.status);
    a.append(dot);
  }
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
function updateTitle() {
  const unread = chatsCache.reduce((n, c) => n + (c.id === active ? 0 : c.unread || 0), 0);
  document.title = unread ? "(" + unread + ") yaebal panel" : "yaebal panel";
}

async function loadChats() {
  if (searchQuery) return renderSidebar();
  const params = chatFilter !== "all" ? "?status=" + chatFilter : "";
  const res = await api("/api/chats" + params);
  if (!res.ok) return;
  chatsCache = await res.json();
  renderSidebar();
}

async function renderSidebar() {
  const box = document.getElementById("chat-list");
  box.innerHTML = "";
  updateTitle();

  if (searchQuery) {
    const res = await api("/api/search?q=" + encodeURIComponent(searchQuery)).catch(() => null);
    const results = res && res.ok ? await res.json() : [];
    if (res && res.status === 501) {
      box.append(el("div", "chat-handle", "this store doesn't support search"));
      return;
    }
    for (const r of results) box.append(searchResultRow(r));
    if (!results.length) box.append(el("div", "chat-handle", "no matches"));
    return;
  }

  for (const c of chatsCache) box.append(chatRow(c));
}

function searchResultRow(r) {
  const chat = chatsCache.find((c) => c.id === r.chatId) || { id: r.chatId, name: "chat " + r.chatId };
  const row = el("button", "chat"); row.type = "button";
  row.append(avatar(chat));
  const body = el("div", "chat-body");
  body.append(el("div", "chat-name", displayName(chat)));
  body.append(el("div", "chat-handle", r.message.text));
  row.append(body);
  row.onclick = () => openChat(r.chatId);
  return row;
}

function chatRow(c) {
  const row = el("button", "chat" + (c.id === active ? " on" : "")); row.type = "button";
  row.append(avatar(c));
  const body = el("div", "chat-body");
  const line = el("div", "chat-line");
  const nameWrap = el("div", "chat-name-wrap");
  nameWrap.append(el("div", "chat-name", displayName(c)));
  if (c.pinned) { const p = el("span", "pin-mark"); p.append(icon("pin")); nameWrap.append(p); }
  line.append(nameWrap, el("div", "chat-time", time(c.lastDate)));
  body.append(line);
  const handle = handleName(c); if (handle) body.append(el("div", "chat-handle", handle));
  const preview = el("div", "preview");
  const main = el("div", "preview-main");
  const kind = c.lastAttachmentType || placeholderKind(c.lastText);
  if (c.lastEventType) {
    main.append(icon(eventIcon(c.lastEventType)), el("span", "preview-label", "event"), el("span", "preview-text", c.lastText));
  } else if (kind) {
    const caption = isPlaceholder(c.lastText) ? "" : c.lastText;
    main.append(icon(mediaIcon(kind)), el("span", "preview-label", mediaLabel(kind)), el("span", "preview-text", caption || "media message"));
  } else {
    main.append(el("span", "preview-text", c.lastText || "message"));
  }
  preview.append(main);
  if (c.unread > 0 && c.id !== active) preview.append(el("span", "unread-badge", String(c.unread > 99 ? "99+" : c.unread)));
  body.append(preview);
  row.append(body);
  row.onclick = () => openChat(c.id);
  return row;
}
function chatById(id) { return chatsCache.find((c) => c.id === id) || { id, name:"chat " + id, lastText:"", lastDate:0, status:"open", unread:0 }; }

const fileSrc = (att) => BASE + "/api/file?id=" + encodeURIComponent(att.fileId);
function attEl(att, caption) {
  const src = fileSrc(att);
  if (att.type === "photo" || att.type === "sticker") {
    const btn = el("button", "media-frame image"); btn.type = "button";
    const img = el("img"); img.src = src; img.loading = "lazy"; img.alt = att.type;
    btn.append(img, el("span", "expand")); btn.querySelector(".expand").append(icon("search"));
    btn.onclick = (e) => { e.stopPropagation(); openViewer(att, caption); };
    return btn;
  }
  if (att.type === "video" || att.type === "animation" || att.type === "video_note") {
    const box = el("div", "video-card");
    const v = el("video"); v.src = src; v.controls = true; v.preload = "metadata";
    const badge = el("div", "video-badge"); badge.append(icon("video"), el("span", null, mediaLabel(att.type)));
    const expand = el("button", "expand"); expand.type = "button"; expand.append(icon("search"));
    expand.onclick = (e) => { e.stopPropagation(); openViewer(att, caption); };
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
  link.onclick = (e) => e.stopPropagation();
  const mark = el("div", "doc-mark"); mark.append(icon("file"));
  const meta = el("div"); meta.append(el("div", "doc-title", att.fileName || mediaLabel(att.type)), el("div", "doc-sub", att.mimeType || "telegram file"));
  link.append(mark, meta);
  return link;
}
// only http(s)/tg schemes are ever followed — a keyboard's url comes from whatever wrote
// PanelStore.record (any framework/adapter), so it isn't guaranteed telegram-clean.
function safeHref(url) {
  try {
    const scheme = new URL(url, "http://x").protocol;
    return scheme === "http:" || scheme === "https:" || scheme === "tg:" ? url : null;
  } catch { return null; }
}
function keyboardEl(k) {
  const box = el("div", "keyboard");
  for (const row of k.rows || []) {
    const r = el("div", "keyboard-row");
    for (const b of row) {
      const href = b.url ? safeHref(b.url) : null;
      const node = href ? el("a", "key") : el("div", "key");
      if (href) { node.href = href; node.target = "_blank"; node.rel = "noreferrer"; node.onclick = (e) => e.stopPropagation(); }
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

function messageLabel(id) {
  const found = [...renderedBySeq.values()].find((n) => n.dataset && Number(n.dataset.msgId) === id);
  return found ? found.dataset.preview : ("#" + id);
}

function bubble(m, chatId) {
  if (m.event) return eventBubble(m);

  const wrap = el("div", "msg " + m.direction);
  const card = el("div", "bubble" + (m.deleted ? " deleted" : ""));
  if (m.id != null) { wrap.dataset.msgId = String(m.id); wrap.dataset.preview = (m.text || "").slice(0, 60); }

  if (m.replyToId != null) {
    const strip = el("div", "reply-strip");
    strip.append(el("span", null, "↩ " + messageLabel(m.replyToId)));
    card.append(strip);
  }

  const atts = m.attachments || [];
  if (m.mediaGroupId && atts.length) {
    const grid = el("div", "album-grid");
    for (const a of atts) grid.append(attEl(a, m.text));
    card.append(grid);
  } else {
    for (const a of atts) card.append(attEl(a, m.text));
  }

  const label = m.deleted ? "message deleted" : m.text;
  if (label && !(atts.length && !m.deleted && isPlaceholder(m.text))) card.append(el("div", "cap", label));
  if (m.keyboard && !m.deleted) card.append(keyboardEl(m.keyboard));

  const canAct = m.id != null && !m.deleted;
  if (canAct) {
    const actions = el("div", "actions-bar");
    const replyBtn = el("button", null); replyBtn.type = "button"; replyBtn.append(icon("reply"), el("span", null, "reply"));
    replyBtn.onclick = (e) => { e.stopPropagation(); startReply(m); };
    actions.append(replyBtn);

    const copyBtn = el("button", null); copyBtn.type = "button"; copyBtn.append(icon("copy"), el("span", null, "copy"));
    copyBtn.onclick = (e) => { e.stopPropagation(); navigator.clipboard?.writeText(m.text || ""); };
    actions.append(copyBtn);

    if (m.direction === "out") {
      if (!atts.length) {
        const editBtn = el("button", null); editBtn.type = "button"; editBtn.append(icon("edit"), el("span", null, "edit"));
        editBtn.onclick = (e) => { e.stopPropagation(); startEdit(m); };
        actions.append(editBtn);
      }
      const delBtn = el("button", "danger"); delBtn.type = "button"; delBtn.append(icon("trash"), el("span", null, "delete"));
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm("delete this message?")) return;
        await postJSON("/api/chats/" + chatId + "/messages/" + m.id + "/delete");
        appendIncoming(chatId);
      };
      actions.append(delBtn);
    }
    card.append(actions);
    card.onclick = () => actions.classList.toggle("open");
  }

  const metaRow = el("div", "meta-row");
  metaRow.append(el("div", "time", time(m.date)));
  if (m.operator) metaRow.append(el("div", "operator-tag", "· " + m.operator));
  if (m.edited && !m.deleted) metaRow.append(el("div", "edited-tag", "edited"));

  wrap.append(card, metaRow);
  return wrap;
}
function addToAlbum(node, m) {
  const grid = node.querySelector(".album-grid"); if (!grid) return;
  for (const a of m.attachments || []) grid.append(attEl(a, m.text));
  if (m.text && !isPlaceholder(m.text)) node.querySelector(".bubble").append(el("div", "cap", m.text));
}

function startReply(m) {
  composeEditing = null;
  composeReplyTo = { id: m.id, label: (m.text || "message").slice(0, 60) };
  updateBanner();
  document.querySelector("#composer input.text")?.focus();
}
function startEdit(m) {
  composeReplyTo = null;
  composeEditing = { id: m.id };
  const input = document.querySelector("#composer input.text");
  if (input) { input.value = m.text || ""; input.focus(); }
  updateBanner();
}
function cancelCompose() {
  composeReplyTo = null; composeEditing = null;
  updateBanner();
  const input = document.querySelector("#composer input.text");
  if (input) input.value = "";
}
function updateBanner() {
  const banner = document.querySelector(".compose-banner");
  if (!banner) return;
  const label = banner.querySelector(".label");
  if (composeEditing) { label.innerHTML = ""; label.append(document.createTextNode("editing message")); banner.classList.add("show"); }
  else if (composeReplyTo) { label.innerHTML = ""; label.append(document.createTextNode("replying to: " + composeReplyTo.label)); banner.classList.add("show"); }
  else banner.classList.remove("show");
}

function renderInitial(msgs) {
  renderedBySeq = new Map();
  const out = [];
  let group = null, groupId = null;
  for (const m of msgs) {
    if (!m.event && m.mediaGroupId && m.mediaGroupId === groupId && group) {
      addToAlbum(group, m);
      if (m.seq != null) renderedBySeq.set(m.seq, group);
      continue;
    }
    const b = bubble(m, active);
    if (m.seq != null) renderedBySeq.set(m.seq, b);
    if (!m.event && m.mediaGroupId) { group = b; groupId = m.mediaGroupId; }
    else { group = null; groupId = null; }
    out.push(b);
  }
  return out;
}

function patchInPlace(node, m) {
  if (m.event) return;
  const card = node.querySelector(".bubble");
  if (!card) return;
  card.classList.toggle("deleted", !!m.deleted);
  const cap = card.querySelector(".cap");
  const label = m.deleted ? "message deleted" : m.text;
  if (cap) cap.textContent = label;
  else if (label) card.insertBefore(el("div", "cap", label), card.querySelector(".actions-bar"));
  const metaRow = node.querySelector(".meta-row");
  let editedTag = metaRow?.querySelector(".edited-tag");
  if (m.edited && !m.deleted) {
    if (!editedTag) metaRow?.append(el("div", "edited-tag", "edited"));
  } else editedTag?.remove();
}

async function appendIncoming(id) {
  const log = document.getElementById("log");
  if (!log || renderedChatId !== id) return;

  const res = await api("/api/chats/" + id + "?limit=60");
  if (!res.ok || renderedChatId !== id) return;
  const recent = await res.json();

  let tailNode = null, tailGroupId = null;
  for (const [, node] of renderedBySeq) { tailNode = node; }
  const lastRendered = log.lastElementChild && log.lastElementChild.classList.contains("msg") ? log.lastElementChild : null;
  if (lastRendered) tailGroupId = lastRendered.dataset.groupId || null;

  for (const m of recent) {
    const existing = m.seq != null ? renderedBySeq.get(m.seq) : undefined;
    if (existing) { patchInPlace(existing, m); continue; }

    if (!m.event && m.mediaGroupId && m.mediaGroupId === tailGroupId && lastRendered) {
      addToAlbum(lastRendered, m);
      if (m.seq != null) renderedBySeq.set(m.seq, lastRendered);
      continue;
    }

    const b = bubble(m, id);
    if (m.seq != null) renderedBySeq.set(m.seq, b);
    if (!m.event && m.mediaGroupId) { b.dataset.groupId = m.mediaGroupId; tailGroupId = m.mediaGroupId; }
    else tailGroupId = null;
    log.append(b);
  }

  const wasNearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 120;
  if (wasNearBottom) log.scrollTop = log.scrollHeight;
}

function statusPill(current, chatId, status, label) {
  const btn = el("button", "status-pill" + (current === status ? " on" : ""), label);
  btn.type = "button"; btn.dataset.status = status;
  btn.onclick = async () => { await postJSON("/api/chats/" + chatId + "/status", { status }); loadChats(); };
  return btn;
}

async function openChat(id) {
  const switching = id !== renderedChatId;
  active = id;
  document.body.classList.add("chat-open");
  loadChats();

  const res = await api("/api/chats/" + id + "?limit=200");
  if (active !== id) return; // operator switched away while this was in flight
  if (!res.ok) return;
  const msgs = await res.json();
  if (active !== id) return;

  if (!switching) { appendIncoming(id); return; }

  renderedChatId = id;
  oldest = msgs.length ? { date: msgs[0].date, seq: msgs[0].seq } : null;
  const c = chatById(id);
  const main = document.getElementById("main");
  main.innerHTML = "";

  const head = el("div", "thread-head");
  const back = el("button", "ghost back"); back.type = "button"; back.append(icon("back"));
  back.onclick = () => { document.body.classList.remove("chat-open"); };
  const meta = el("div", "meta"); meta.append(el("div", "name", displayName(c)), el("div", "sub", handleName(c) || "private chat"));

  const controls = el("div", "thread-controls");
  controls.append(statusPill(c.status, id, "open", "open"));
  controls.append(statusPill(c.status, id, "handled", "handled"));
  controls.append(statusPill(c.status, id, "archived", "archived"));

  const assignChip = el("div", "assign-chip");
  const renderAssign = () => {
    assignChip.innerHTML = "";
    assignChip.append(el("span", null, c.assignedTo ? "assigned: " : "unassigned"));
    if (c.assignedTo) assignChip.querySelector("span").append((() => { const b = el("b", null, c.assignedTo); return b; })());
    const btn = el("button", null, c.assignedTo === operatorName ? "release" : "take"); btn.type = "button";
    btn.onclick = async () => {
      await postJSON("/api/chats/" + id + "/assign", { operator: c.assignedTo === operatorName ? null : operatorName });
      loadChats();
    };
    assignChip.append(btn);
  };
  renderAssign();
  controls.append(assignChip);

  const pinBtn = el("button", "ghost" + (c.pinned ? " on" : "")); pinBtn.type = "button"; pinBtn.title = "pin"; pinBtn.append(icon("pin"));
  pinBtn.onclick = async () => { await postJSON("/api/chats/" + id + "/pin", { pinned: !c.pinned }); loadChats(); openChat(id); };
  controls.append(pinBtn);

  const exportLink = el("a", "ghost"); exportLink.title = "export"; exportLink.append(icon("download"));
  exportLink.href = BASE + "/api/chats/" + id + "/export?format=json"; exportLink.target = "_blank"; exportLink.rel = "noreferrer";
  controls.append(exportLink);

  const deleteBtn = el("button", "ghost"); deleteBtn.type = "button"; deleteBtn.title = "delete chat"; deleteBtn.append(icon("trash"));
  deleteBtn.onclick = async () => {
    if (!confirm("delete this entire conversation from the panel?")) return;
    await api("/api/chats/" + id, { method: "DELETE" });
    active = null; renderedChatId = null;
    document.body.classList.remove("chat-open");
    showEmpty();
    loadChats();
  };
  controls.append(deleteBtn);

  head.append(back, avatar(c, true), meta, controls);

  const log = el("div"); log.id = "log";
  if (msgs.length >= 200) { const more = el("button", "more", "load earlier"); more.onclick = () => loadEarlier(id, log); log.append(more); }
  for (const b of renderInitial(msgs)) log.append(b);

  const composer = el("form"); composer.id = "composer";
  const banner = el("div", "compose-banner");
  banner.append(el("span", "label"));
  const cancelBtn = el("button", null); cancelBtn.type = "button"; cancelBtn.append(icon("close"));
  cancelBtn.onclick = cancelCompose;
  banner.append(cancelBtn);

  const row = el("div", "compose-row");
  const fileInput = el("input"); fileInput.type = "file"; fileInput.style.display = "none";
  const attach = el("button", "attach"); attach.type = "button"; attach.title = "send a file"; attach.append(icon("attach"));
  attach.onclick = () => fileInput.click();

  const cannedBtn = el("button", "canned-btn"); cannedBtn.type = "button"; cannedBtn.title = "canned responses"; cannedBtn.append(icon("keyboard"));
  const cannedPop = el("div", "canned-pop");
  const renderCanned = () => {
    cannedPop.innerHTML = "";
    if (!cannedCache.length) cannedPop.append(el("div", "chat-handle", "no canned responses configured"));
    for (const c2 of cannedCache) {
      const item = el("button", "canned-item"); item.type = "button";
      item.append(el("div", "label", c2.label), el("div", "text", c2.text));
      item.onclick = () => { input.value = c2.text; cannedPop.classList.remove("show"); input.focus(); };
      cannedPop.append(item);
    }
  };
  cannedBtn.onclick = () => { renderCanned(); cannedPop.classList.toggle("show"); };

  const input = el("input", "text"); input.placeholder = "reply..."; input.autocomplete = "off";
  const sendBtn = el("button", "send"); sendBtn.type = "submit";
  sendBtn.append(icon("send"), el("span", null, "send"), el("span", "spinner"));
  row.append(attach, fileInput, cannedBtn, cannedPop, input, sendBtn);

  const errorBox = el("div", "compose-error");

  // disable the whole composer while a request is in flight: gives real visual feedback
  // instead of the button silently doing nothing, and stops an impatient extra click from
  // firing a duplicate send on top of the one already on the wire.
  let busy = false;
  function setBusy(next) {
    busy = next;
    sendBtn.disabled = next;
    sendBtn.classList.toggle("loading", next);
    attach.disabled = next;
    input.disabled = next;
  }

  input.oninput = () => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => { postJSON("/api/chats/" + id + "/typing").catch(() => {}); }, 400);
  };

  fileInput.onchange = async () => {
    if (busy) return;
    const file = fileInput.files && fileInput.files[0]; if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    if (input.value.trim()) fd.append("caption", input.value.trim());
    const caption = input.value; input.value = ""; fileInput.value = "";
    setBusy(true);
    try {
      const res2 = await api("/api/chats/" + id + "/send", { method: "POST", body: fd });
      if (!res2.ok) {
        input.value = caption;
        errorBox.textContent = "failed to send the file — try again";
        errorBox.classList.add("show");
        return;
      }
      errorBox.classList.remove("show");
      appendIncoming(id);
    } finally {
      setBusy(false);
    }
  };

  composer.onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const text = input.value.trim();
    if (!text) return;

    setBusy(true);
    try {
      if (composeEditing) {
        const editing = composeEditing;
        const res2 = await postJSON("/api/chats/" + id + "/messages/" + editing.id + "/edit", { text });
        if (!res2.ok) { errorBox.textContent = "failed to edit"; errorBox.classList.add("show"); return; }
        errorBox.classList.remove("show");
        cancelCompose();
        appendIncoming(id);
        return;
      }

      const body = { text };
      if (composeReplyTo) body.replyToId = composeReplyTo.id;
      const savedText = text;
      input.value = "";
      const res2 = await postJSON("/api/chats/" + id + "/send", body);
      if (!res2.ok) {
        input.value = savedText; // don't silently swallow the operator's message on failure
        errorBox.textContent = "failed to send — try again";
        errorBox.classList.add("show");
        return;
      }
      errorBox.classList.remove("show");
      composeReplyTo = null;
      updateBanner();
      appendIncoming(id);
    } finally {
      setBusy(false);
      input.focus();
    }
  };

  composer.append(banner, row, errorBox);
  updateBanner();

  main.append(head, log, composer);
  log.scrollTop = log.scrollHeight;
}
async function loadEarlier(id, log) {
  if (oldest == null) return;
  const res = await api("/api/chats/" + id + "?limit=200&before=" + oldest.date + (oldest.seq != null ? "&beforeSeq=" + oldest.seq : ""));
  if (!res.ok || renderedChatId !== id) return;
  const older = await res.json();
  if (!older.length) { log.querySelector(".more")?.remove(); return; }
  oldest = { date: older[0].date, seq: older[0].seq };

  const anchor = log.querySelector(".more")?.nextSibling ?? log.firstChild;
  const frag = document.createDocumentFragment();
  if (older.length >= 200) { const more = el("button", "more", "load earlier"); more.onclick = () => loadEarlier(id, log); frag.append(more); }

  let group = null, groupId = null;
  for (const m of older) {
    if (!m.event && m.mediaGroupId && m.mediaGroupId === groupId && group) {
      addToAlbum(group, m);
      if (m.seq != null) renderedBySeq.set(m.seq, group);
      continue;
    }
    const b = bubble(m, id);
    if (m.seq != null) renderedBySeq.set(m.seq, b);
    if (!m.event && m.mediaGroupId) { group = b; groupId = m.mediaGroupId; }
    else { group = null; groupId = null; }
    frag.append(b);
  }

  log.querySelector(".more")?.remove();
  log.insertBefore(frag, anchor);
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
document.addEventListener("click", (e) => {
  if (!e.target.closest(".canned-btn") && !e.target.closest(".canned-pop")) {
    document.querySelector(".canned-pop.show")?.classList.remove("show");
  }
});

checkSession().then((op) => { if (op) { operatorName = op; enter(); } });
</script>
</body>
</html>`;
