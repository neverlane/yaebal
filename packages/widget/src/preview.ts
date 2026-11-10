import { type HtmlSource, htmlString, json } from "./html.js";
import type { WidgetThemeParams, WidgetViewer } from "./telegram-widget.js";

/**
 * a standalone html page that runs a widget in an ordinary browser: it defines a
 * `window.TelegramWidget` stub (theme, state, viewer, events, requests, haptics, wallet) before
 * the widget's own code, sets the `--tg-*` css variables telegram provides, and frames the
 * widget at bubble size. open it from disk or serve it from a dev route.
 *
 * the stub resolves `request()` from `answers` — a map from query data to the answer to return,
 * or a function — so a widget can be clicked through without a bot. the page also exposes
 * `window.__widget.setData({ publicData, chatData })` (fires the change events) and
 * `window.__widget.requests` (every query the widget sent).
 */
export interface PreviewOptions {
	/** initial `public_data` (a string, as the bot would send it). */
	publicData?: string;
	/** initial `chat_data`. */
	chatData?: string;
	colorScheme?: "light" | "dark";
	/** override individual theme colors. */
	theme?: Partial<WidgetThemeParams>;
	/** the viewer (default a sample user). `null` = a widget that may not ask the bot. */
	viewer?: WidgetViewer | null;
	chatType?: "private" | "group" | "supergroup" | "channel" | null;
	/** bubble width in px (default 360). */
	width?: number;
	/** fixed height in px (default: auto). */
	height?: number;
	/**
	 * answers for `request(data)`, keyed by the exact query data. a value is json-encoded unless it
	 * is a string; a missing key rejects with `NOT_ALLOWED`. there is no function form — the page
	 * is static html, the map is embedded in it.
	 */
	answers?: Record<string, unknown>;
	/** give the stub a wallet (sendTransaction/signData resolve with `{ result: null }`). */
	wallet?: boolean;
	/** the page `<title>`. */
	title?: string;
}

/** telegram's default light / dark chat themes, roughly — enough to judge contrast. */
export const PREVIEW_THEMES: Record<"light" | "dark", WidgetThemeParams> = {
	light: {
		bg_color: "#ffffff",
		text_color: "#000000",
		hint_color: "#999999",
		link_color: "#2481cc",
		button_color: "#2481cc",
		button_text_color: "#ffffff",
		secondary_bg_color: "#efeff3",
		accent_text_color: "#2481cc",
		subtitle_text_color: "#999999",
		destructive_text_color: "#e53935",
		section_bg_color: "#ffffff",
		section_header_text_color: "#6d6d72",
		section_separator_color: "#e7e7e7",
		header_bg_color: "#ffffff",
		bottom_bar_bg_color: "#ffffff",
	},
	dark: {
		bg_color: "#212d3b",
		text_color: "#ffffff",
		hint_color: "#7d8b99",
		link_color: "#5eb5f7",
		button_color: "#5288c1",
		button_text_color: "#ffffff",
		secondary_bg_color: "#17212b",
		accent_text_color: "#64b5ef",
		subtitle_text_color: "#7e8a97",
		destructive_text_color: "#ee686f",
		section_bg_color: "#17212b",
		section_header_text_color: "#6ab3f3",
		section_separator_color: "#111921",
		header_bg_color: "#17212b",
		bottom_bar_bg_color: "#17212b",
	},
};

const DEFAULT_VIEWER: WidgetViewer = { id: 1, first_name: "Preview", username: "preview" };

const STUB = `(()=>{const C=__C__,H={},S={publicData:C.publicData,chatData:C.chatData};
const fire=t=>(H[t]||[]).forEach(h=>h.call(W));
const err=c=>{const e=new Error(c);e.name="WidgetRequestError";e.code=c;return e};
const ok=v=>({result:v===undefined||v===null?null:typeof v==="string"?v:JSON.stringify(v)});
const requests=[];const haptic={impactOccurred(){return haptic},notificationOccurred(){return haptic},selectionChanged(){return haptic}};
const W={profile:1,colorScheme:C.colorScheme,themeParams:Object.freeze(C.theme),isActive:true,isPreview:false,isForward:false,
chatType:C.chatType,viewer:C.viewer&&Object.freeze(C.viewer),get publicData(){return S.publicData},get chatData(){return S.chatData},
contentSafeAreaInset:Object.freeze({top:0,right:0,bottom:0,left:0,cornerRight:0,cornerLeft:0}),HapticFeedback:haptic,
wallet:C.wallet?{sendTransaction(tx,data){requests.push({data,transaction:tx});return Promise.resolve({result:null})},signData(payload,data){requests.push({data,payload});return Promise.resolve({result:null})}}:null,
isProfileAtLeast:n=>typeof n==="number"&&n<=1,watchPublicData(){},unwatchPublicData(){},
request(data,options){requests.push({data,options});if(!C.viewer)return Promise.reject(err("NOT_ALLOWED"));return Object.prototype.hasOwnProperty.call(C.answers,data)?Promise.resolve(ok(C.answers[data])):Promise.reject(err("NOT_ALLOWED"))},
copyText(t){console.info("[widget] copyText",t)},openLink(u){window.open(u,"_blank","noopener")},openTelegramLink(u){window.open(u,"_blank","noopener")},
setResizeAnchor(){},ready(){},onEvent(t,h){(H[t]=H[t]||[]).push(h)},offEvent(t,h){H[t]=(H[t]||[]).filter(x=>x!==h)}};
window.TelegramWidget=W;
window.__widget={requests,setData(d){let c=false,p=false;if("chatData"in d){S.chatData=d.chatData;c=true}if("publicData"in d){S.publicData=d.publicData;p=true}if(c)fire("chatDataChanged");if(p)fire("publicDataChanged")}}})();`;

function cssVariables(theme: WidgetThemeParams, scheme: "light" | "dark"): string {
	const vars = Object.entries(theme).map(
		([key, value]) => `--tg-theme-${key.replace(/_/g, "-")}:${value}`,
	);
	vars.push(
		`--tg-color-scheme:${scheme}`,
		"--tg-text-font-size:15px",
		"--tg-text-line-height:1.35",
		"--tg-text-padding:8px 12px",
		`--tg-button-bg:${theme.button_color}`,
		`--tg-button-text:${theme.button_text_color}`,
		"--tg-button-radius:8px",
		"--tg-button-font:500 15px system-ui,sans-serif",
		"--tg-button-padding:0 16px",
		"--tg-button-height:40px",
		"--tg-button-pressed-opacity:.7",
		"--tg-button-disabled-opacity:.4",
	);
	return vars.join(";");
}

/** build the preview page for `widgetHtml` (the full widget html, client script included). */
export function previewPage(widgetHtml: HtmlSource, options: PreviewOptions = {}): string {
	const scheme = options.colorScheme ?? "light";
	const theme = { ...PREVIEW_THEMES[scheme], ...options.theme };
	const config = {
		publicData: options.publicData ?? null,
		chatData: options.chatData ?? null,
		colorScheme: scheme,
		theme,
		viewer: options.viewer === undefined ? DEFAULT_VIEWER : options.viewer,
		chatType: options.chatType === undefined ? "private" : options.chatType,
		answers: options.answers ?? {},
		wallet: options.wallet === true,
	};
	const width = options.width ?? 360;
	const height = options.height === undefined ? "auto" : `${options.height}px`;
	const title = (options.title ?? "widget preview").replace(/[<&]/g, "");

	return `<!doctype html>
<html lang="en" style="color-scheme:${scheme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
:root{${cssVariables(theme, scheme)}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:${scheme === "dark" ? "#0e1621" : "#c8d6e5"};font:15px/1.35 system-ui,sans-serif}
.bubble{width:${width}px;height:${height};min-height:50px;max-height:600px;overflow:hidden;border-radius:12px;background:var(--tg-theme-bg-color);color:var(--tg-theme-text-color);position:relative}
</style>
<script>${STUB.replace("__C__", () => json(config).value)}</script>
</head>
<body>
<div class="bubble">
${htmlString(widgetHtml)}
</div>
</body>
</html>
`;
}
