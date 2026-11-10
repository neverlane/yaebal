import { json, RawHtml } from "./html.js";

export type { WidgetClientApi } from "./telegram-widget.js";

/**
 * the in-widget half: a tiny script (about 1.1 KB compressed) you put at the top of the widget's html.
 * it wraps `window.TelegramWidget` and speaks the same formats as the bot side of this package:
 *
 * - **typed queries** — `yw.ask("vote", { option: 1 })` packs the payload with the exact wire
 *   format of an `@yaebal/callback-data` namespace, so the bot routes it with
 *   `bot.widgetQuery(vote, …)` and gets `ctx.queryData` typed.
 * - **state** — `yw.onState(({ publicData, chatData }) => draw(...))` decodes the json state the
 *   bot wrote with `widgetState()` / `defineWidget()`, redraws on every change, and (with
 *   revisions on) drops polls older than what's already on screen.
 * - **answers** — json answers come back parsed.
 * - **wallet** — `yw.pay("tip", { amount: 1 })` asks the bot for a transaction and hands it to the
 *   user's TON wallet in one tap; `yw.sign(payload, "proof")` requests a signature.
 *
 * the script never throws outside telegram (`yw.available` is `false` and requests reject with
 * `NOT_ALLOWED`), so the same html works in {@link previewPage}.
 */

/** one field of a packable action — structurally a `@yaebal/callback-data` `FieldDescriptor`. */
export interface WidgetActionField {
	readonly key: string;
	readonly type: "string" | "number" | "boolean" | "enum" | "uuid" | "bigint";
	readonly values?: readonly (string | number)[];
}

/** the wire description of an action — structurally a `@yaebal/callback-data` descriptor. */
export interface WidgetActionDescriptor {
	readonly prefix: string;
	readonly maxBytes: number;
	readonly required: readonly WidgetActionField[];
	readonly optional: readonly WidgetActionField[];
}

/** anything with a wire description — a `callbackData(...)` namespace qualifies. */
export interface WidgetAction {
	describe(): WidgetActionDescriptor;
}

export interface WidgetClientOptions {
	/** actions the widget can `yw.ask()` / `yw.pay()`, by name — usually `callbackData` namespaces. */
	actions?: Record<string, WidgetAction>;
	/** the global the runtime installs itself as. default `"yw"`. */
	global?: string;
	/** state is revisioned (`widgetState({ revision: true })`) — unwrap it and drop stale polls. */
	revision?: boolean;
	/** include `yw.pay()` / `yw.sign()` for TON wallet flows. */
	wallet?: boolean;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * the runtime, as plain ES2023 for telegram's widget engine, assembled from parts so a widget
 * only pays for what it uses (the uuid codec and the wallet calls are opt-in). `A` = action
 * descriptors, `R` = revisioned state. it ships inside every widget and counts against the
 * 4096-byte compressed limit, hence the terse style.
 */
const PART_CORE = String.raw`(()=>{const W=window.TelegramWidget,A=__A__,R=__R__,
F=(c,m)=>Object.assign(Error(m||c),{name:"WidgetRequestError",code:c}),
T=m=>{throw TypeError(m)},
k=(f,v)=>{const t=f.type,n=f.key;if(t=="string")return typeof v=="string"?v.replace(/\\/g,"\\\\").replace(/:/g,"\\:"):T(n+": string");
if(t=="number"){if(typeof v!="number"||!isFinite(v))T(n+": number");if(Number.isSafeInteger(v))return v.toString(36);v=""+v;return/^-?[0-9a-z]+$/.test(v)?T(n+": unsafe"):v}
if(t=="boolean")return v?"1":"0";if(t=="bigint")return typeof v=="bigint"?v.toString(36):T(n+": bigint");
if(t=="enum"){const i=f.values.indexOf(v);return i<0?T(n+": enum"):i.toString(36)}return U(v,n)},
P=(a,o={})=>{const d=A[a]||T("action "+a),p=[d.prefix];for(const f of d.required)p.push(o[f.key]===undefined?T(f.key+": required"):k(f,o[f.key]));
if(d.optional.length){let m=0;const q=[];d.optional.forEach((f,i)=>{if(o[f.key]!==undefined){m|=1<<i;q.push(k(f,o[f.key]))}});p.push(m.toString(36),...q)}
const s=p.join(":"),b=new TextEncoder().encode(s).length;if(b>d.maxBytes)throw RangeError(a+": "+b+" bytes > "+d.maxBytes);return s},
J=s=>{if(s!=null&&s!=="")try{return JSON.parse(s)}catch(e){}},
V=v=>v!==null&&typeof v=="object"&&typeof v.r=="number"&&"v"in v,
S=s=>{const v=J(s);return R?V(v)?v.v:undefined:v},G=s=>{const v=J(s);return R&&V(v)?v.r:-1/0},
N=a=>{const r=a&&a.result;if(r==null)return null;const v=J(r);return v===undefined?r:v},
Q=(d,o)=>W?W.request(d,o).then(N):Promise.reject(F("NOT_ALLOWED","no TelegramWidget")),
X=W||{onEvent(){},offEvent(){},watchPublicData(){},unwatchPublicData(){}},
y={w:W,available:!!W,pack:P,publicData:()=>S(W&&W.publicData),chatData:()=>S(W&&W.chatData),
on(t,f){X.onEvent(t,f);return()=>X.offEvent(t,f)},watch:()=>X.watchPublicData(),unwatch:()=>X.unwatchPublicData(),
onState(f){let a=-1/0,b=-1/0,lp,lc,pv,cv,i=1;const r=()=>{const p=W&&W.publicData,c=W&&W.chatData,x=G(p),z=G(c);let h=i;i=0;
if(p!==lp&&x>=a){a=x;lp=p;pv=S(p);h=1}if(c!==lc&&z>=b){b=z;lc=c;cv=S(c);h=1}if(h)f({publicData:pv,chatData:cv})},
o=[y.on("publicDataChanged",r),y.on("chatDataChanged",r)];r();return()=>o.forEach(g=>g())},
request:Q,ask:(a,o,x)=>Q(P(a,o),x),code:e=>e&&typeof e.code=="string"?e.code:"FAILED"}`;

/** the uuid codec — only emitted when some action has a uuid field. */
const PART_UUID = String.raw`,U=(v,n)=>{if(typeof v!="string"||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v))T(n+": uuid");
let b="";v=v.replace(/-/g,"");for(let i=0;i<32;i+=2)b+=String.fromCharCode(parseInt(v.slice(i,i+2),16));return btoa(b).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}`;
const PART_NO_UUID = `,U=(v,n)=>T(n+": uuid")`;

/** `yw.pay` / `yw.sign` — only emitted with `wallet: true`. */
const PART_WALLET = `;y.pay=(a,o)=>{const l=P(a,o);return W&&W.wallet?W.request(l,{wallet:true}).then(r=>W.wallet.sendTransaction(N(r),l)).then(N):Promise.reject(F("NOT_ALLOWED","no wallet"))};
y.sign=(p,a,o)=>{const l=P(a,o);return W&&W.wallet?W.wallet.signData(p,l).then(N):Promise.reject(F("NOT_ALLOWED","no wallet"))}`;

/** the descriptors {@link widgetClient} embeds, by action name. */
export function describeActions(
	actions: Record<string, WidgetAction> = {},
): Record<string, WidgetActionDescriptor> {
	const out: Record<string, WidgetActionDescriptor> = {};
	for (const [name, action] of Object.entries(actions)) {
		const d = action.describe();
		out[name] = {
			prefix: d.prefix,
			// a widget query is 1-64 bytes whatever the namespace allows
			maxBytes: Math.min(d.maxBytes, 64),
			required: d.required,
			optional: d.optional,
		};
	}
	return out;
}

/**
 * the runtime script source (no `<script>` tag) — for when you assemble the widget's html yourself.
 */
export function widgetClientSource(options: WidgetClientOptions = {}): string {
	const global = options.global ?? "yw";
	if (!IDENTIFIER.test(global)) {
		throw new TypeError(
			`widgetClient: global must be a javascript identifier, got ${JSON.stringify(global)}`,
		);
	}
	const descriptors = describeActions(options.actions);
	const usesUuid = Object.values(descriptors).some((d) =>
		[...d.required, ...d.optional].some((f) => f.type === "uuid"),
	);
	// function replacers: a `$&` / `$1` inside the json must not be read as a replacement pattern
	const actions = json(descriptors).value;
	const core = PART_CORE.replace("__A__", () => actions).replace("__R__", () =>
		options.revision === true ? "1" : "0",
	);
	return `${core}${usesUuid ? PART_UUID : PART_NO_UUID};${options.wallet === true ? `${PART_WALLET};` : ""}window[${JSON.stringify(global)}]=y})();`;
}

/** the runtime as a `<script>` element, ready to interpolate into {@link html}. */
export function widgetClient(options: WidgetClientOptions = {}): RawHtml {
	return new RawHtml(`<script>${widgetClientSource(options)}</script>`);
}
