// generates src/generated/*.ts: one file per Update type with a context class whose
// shortcut methods are auto-derived from the Telegram Bot API methods + the ids the context
// carries. a few high-value contexts get a hand-written sugar subclass (see SUGARED +
// ../src/sugar/*); the generated class becomes their `*Base`.
// run: node scripts/generate.mjs  (after refreshing ../types/schema.json)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const schema = JSON.parse(readFileSync(new URL("../types/schema.json", root), "utf8"));
const objects = new Map(schema.objects.map((o) => [o.name, o]));

// id params a context can fill from what it carries
const ID_FILLABLE = [
	"chat_id",
	"message_id",
	"user_id",
	"callback_query_id",
	"inline_query_id",
	"shipping_query_id",
	"pre_checkout_query_id",
	"guest_query_id",
	"from_chat_id",
];

// a shortcut must target one of these (otherwise it's not really "this thing")
const TARGET_IDS = new Set([
	"chat_id",
	"user_id",
	"callback_query_id",
	"inline_query_id",
	"shipping_query_id",
	"pre_checkout_query_id",
	"guest_query_id",
]);

const QUERY_ID = {
	CallbackQuery: "callback_query_id",
	InlineQuery: "inline_query_id",
	ShippingQuery: "shipping_query_id",
	PreCheckoutQuery: "pre_checkout_query_id",
};

// pretty names for the high-value shortcuts; everything else keeps its method name
const SHORT = {
	sendMessage: "send",
	editMessageText: "editText",
	editMessageCaption: "editCaption",
	editMessageReplyMarkup: "editReplyMarkup",
	editMessageMedia: "editMedia",
	editMessageLiveLocation: "editLiveLocation",
	deleteMessage: "delete",
	pinChatMessage: "pin",
	unpinChatMessage: "unpin",
	forwardMessage: "forward",
	copyMessage: "copy",
	setMessageReaction: "react",
	answerCallbackQuery: "answer",
	answerInlineQuery: "answer",
	answerShippingQuery: "answer",
	answerPreCheckoutQuery: "answer",
	answerGuestQuery: "answer",
};

// update prop -> public class comes from src/sugar/<kebab>.ts (extends the generated *Base)
const SUGARED = {
	message: true,
	edited_message: true,
	channel_post: true,
	edited_channel_post: true,
	business_message: true,
	edited_business_message: true,
	callback_query: true,
	inline_query: true,
	shipping_query: true,
	pre_checkout_query: true,
	chat_join_request: true,
	guest_message: true,
};

const capFirst = (s) => s[0].toUpperCase() + s.slice(1);
const snakePascal = (s) => s.replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase());
const kebab = (s) => s.replace(/_/g, "-");

const returnType = (node) => {
	switch (node?.type) {
		case "reference":
			return `t.${node.reference}`;
		case "array":
			return `${returnType(node.array)}[]`;
		case "bool":
			return "boolean";
		case "integer":
		case "float":
			return "number";
		case "string":
			return "string";
		case "any_of":
			return node.any_of.map(returnType).join(" | ");
		default:
			return "unknown";
	}
};

function providersFor(payload, propName) {
	const fields = new Map((payload.properties || []).map((f) => [f.name, f]));
	const p = {};

	if (fields.has("chat")) {
		p.chat_id = "this.chat.id";
		p.from_chat_id = "this.chat.id";
	}

	if (fields.has("message_id")) p.message_id = "this.message_id";
	if (fields.has("from")) p.user_id = fields.get("from").required ? "this.from.id" : "this.from?.id";

	const qid = QUERY_ID[payload.name];
	if (qid && fields.has("id")) p[qid] = "this.id";

	// guest_message reuses the plain Message payload (unlike callback/inline/shipping/
	// pre-checkout, which have their own dedicated query object) — guest_query_id only
	// means something for that one update slot, so gate on propName, not on the payload.
	if (propName === "guest_message" && fields.has("guest_query_id")) {
		p.guest_query_id = "this.guest_query_id";
	}

	if (payload.name === "CallbackQuery") {
		p.chat_id = "this.message?.chat.id";
		p.message_id = "this.message?.message_id";
	}

	return p;
}

function methodsFor(providers, isMessage) {
	const lines = [];
	const used = new Set();

	if (isMessage && providers.chat_id && providers.message_id) {
		lines.push(`	/** reply to this message. */
	reply(params: Omit<t.SendMessageParams, "chat_id">) {
		return this.api.call<t.Message>("sendMessage", { chat_id: ${providers.chat_id}, reply_parameters: { message_id: this.message_id }, ...params });
	}`);
		used.add("reply");
	}

	for (const m of schema.methods) {
		const args = m.arguments || [];
		const idArgs = args.filter((a) => ID_FILLABLE.includes(a.name)).map((a) => a.name);
		const hasFromChat = idArgs.includes("from_chat_id");
		const fills = idArgs.filter(
			(n) => providers[n] !== undefined && !(hasFromChat && n === "chat_id"),
		);

		if (fills.length === 0) continue;
		const unfilledRequired = args
			.filter((a) => a.required && ID_FILLABLE.includes(a.name))
			.map((a) => a.name)
			.filter((n) => !fills.includes(n) && !(hasFromChat && n === "chat_id"));
		
		if (unfilledRequired.length) continue;
		if (!fills.some((n) => TARGET_IDS.has(n))) continue;

		const name = SHORT[m.name] ?? m.name;

		if (used.has(name)) continue;
		used.add(name);

		const paramsType = `t.${capFirst(m.name)}Params`;
		const omit = fills.map((f) => JSON.stringify(f)).join(" | ");
		const fillObj = fills.map((f) => `${f}: ${providers[f]}`).join(", ");
		const ret = m.return_type ? returnType(m.return_type) : "unknown";
		const otherArgs = args.some((a) => !fills.includes(a.name));
		const sig = otherArgs ? `params: Omit<${paramsType}, ${omit}>` : `params?: Omit<${paramsType}, ${omit}>`;
		const desc = (m.description || "").replace(/\r?\n/g, " ").replace(/\*\//g, "*\\/").trim();

		lines.push(`	/** ${desc} */
	${name}(${sig}) {
		return this.api.call<${ret}>("${m.name}", { ${fillObj}, ...params });
	}`);
	}

	return lines;
}

// ergonomic camel-case getters (the gramio/puregram idea), derived from the
// payload's own fields so every context exposes them uniformly.
function gettersFor(payload) {
	const fields = new Map((payload.properties || []).map((f) => [f.name, f]));
	const lines = [];
	const fromKey = fields.has("from") ? "from" : fields.has("user") ? "user" : null;

	if (fromKey) {
		const o = fields.get(fromKey).required ? "" : "?";

		lines.push(`	/** id of the user this update is from. */
	get senderId(): number${o ? " | undefined" : ""} {
		return this.${fromKey}${o}.id;
	}`);

		lines.push(`	/** first name of the user this update is from. */
	get firstName(): string | undefined {
		return this.${fromKey}${o}.first_name;
	}`);
	}

	if (fields.has("chat")) {
		const o = fields.get("chat").required ? "" : "?";

		lines.push(`	/** id of the chat this update is in. */
	get chatId(): number${o ? " | undefined" : ""} {
		return this.chat${o}.id;
	}`);

		lines.push(`	/** whether this is a private (1:1) chat. */
	get isPM(): boolean {
		return this.chat${o}.type === "private";
	}`);

		lines.push(`	/** whether this is a group or supergroup. */
	get isGroup(): boolean {
		return this.chat${o}.type === "group" || this.chat${o}.type === "supergroup";
	}`);
	}

	if (fields.has("message_id")) {
		lines.push(`	/** camel-case alias for \`message_id\`. */
	get messageId(): number {
		return this.message_id;
	}`);
	}

	return lines;
}

const update = objects.get("Update");
const payloadProps = update.properties.filter((p) => p.name !== "update_id");

const genDir = new URL("src/generated/", root);
mkdirSync(genDir, { recursive: true });

const header = `// AUTO-GENERATED — do not edit by hand. regenerate: pnpm --filter @yaebal/contexts generate
import type { Api } from "@yaebal/core";
import type * as t from "@yaebal/types";

`;

const entries = []; // { prop, payloadName, pascal, kebab, sugared }

for (const prop of payloadProps) {
	const payloadName = prop.reference;

	const payload = objects.get(payloadName);
	if (!payload) continue;

	const pascal = snakePascal(prop.name);
	const sugared = !!SUGARED[prop.name];
	const className = sugared ? `${pascal}ContextBase` : `${pascal}Context`;
	const methods = methodsFor(providersFor(payload, prop.name), payloadName === "Message");
	const getters = gettersFor(payload);

	const file = `${header}export interface ${className} extends t.${payloadName} {}
export class ${className} {
	readonly api: Api;
	readonly update: t.Update;
	constructor(api: Api, update: t.Update) {
		this.api = api;
		this.update = update;
		Object.assign(this, update.${prop.name} ?? {});
	}
${[...getters, ...methods].join("\n")}
}
`;

	writeFileSync(new URL(`${kebab(prop.name)}.ts`, genDir), file);
	entries.push({ prop: prop.name, pascal, kebab: kebab(prop.name), sugared });
}

// barrel: re-export every public class, the type map, and the factory
const importLine = (e) =>
	e.sugared
		? `import { ${e.pascal}Context } from "../sugar/${e.kebab}.js";`
		: `import { ${e.pascal}Context } from "./${e.kebab}.js";`;

const reexport = (e) =>
	e.sugared
		? `export { ${e.pascal}Context } from "../sugar/${e.kebab}.js";\nexport { ${e.pascal}ContextBase } from "./${e.kebab}.js";`
		: `export { ${e.pascal}Context } from "./${e.kebab}.js";`;

const index = `// AUTO-GENERATED — do not edit by hand. regenerate: pnpm --filter @yaebal/contexts generate
import type { Api } from "@yaebal/core";
import type * as t from "@yaebal/types";
${entries.map(importLine).join("\n")}

${entries.map(reexport).join("\n")}

/** maps an update type to its context class. */
export interface ContextByType {
${entries.map((e) => `	${e.prop}: ${e.pascal}Context;`).join("\n")}
}

const CONTEXTS = {
${entries.map((e) => `	${e.prop}: ${e.pascal}Context,`).join("\n")}
} satisfies { [K in keyof ContextByType]: new (api: Api, update: t.Update) => ContextByType[K] };

/** build the right context for an update. */
export function contextFor<K extends keyof ContextByType>(
	type: K,
	api: Api,
	update: t.Update,
): ContextByType[K] {
	const Ctor = (CONTEXTS[type] ?? CONTEXTS.message) as new (
		api: Api,
		update: t.Update,
	) => ContextByType[K];
	return new Ctor(api, update);
}
`;

writeFileSync(new URL("index.ts", genDir), index);
console.log(`generated ${entries.length} contexts (+${Object.keys(SUGARED).length} sugared) from ${schema.methods.length} methods`);
