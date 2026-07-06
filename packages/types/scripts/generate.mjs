// generates src/telegram.ts from the machine-readable Telegram Bot API schema (schema.json).
// run: node scripts/generate.mjs (re-run after refreshing schema.json)
import { readFileSync, writeFileSync } from "node:fs";
import { fieldType, pascal } from "./lib/render-type.mjs";

const root = new URL("..", import.meta.url);
const schema = JSON.parse(readFileSync(new URL("schema.json", root), "utf8"));

const jsdoc = (desc, indent = "") => {
	if (!desc) return "";

	const clean = desc.replace(/\r?\n/g, " ").replace(/\*\//g, "*\\/").trim();
	return `${indent}/** ${clean} */\n`;
};

// `widen` marks format-site text fields (see the format-fields section below): they render
// as `string | FormattedText`, so the typed method surface accepts a `format` result exactly
// where the client's applyFormatFields will split it.
const field = (f, indent = "\t", widen = null) => {
	const base = fieldType(f);
	const type = widen?.has(f.name) && base === "string" ? "string | FormattedText" : base;
	return `${jsdoc(f.description, indent)}${indent}${f.name}${f.required ? "" : "?"}: ${type};\n`;
};

// the docs give InputFile no schema shape ("the file contents"). emit the structural union
// that `media.path/url/buffer/fileId` from @yaebal/core produce, instead of the old
// `Record<never, never>` — which accepted literally any object (even `new Date()`).
const INPUT_FILE_TYPE = `export type InputFile =
	| { kind: "path"; path: string }
	| { kind: "url"; url: string }
	| { kind: "buffer"; buffer: Uint8Array; filename?: string }
	| { kind: "fileId"; fileId: string };
`;

const emitObject = (o, widen = null) => {
	let out = jsdoc(o.description);

	if (o.name === "InputFile") {
		out += INPUT_FILE_TYPE;
	} else if (o.properties) {
		out += `export interface ${o.name} {\n${o.properties.map((p) => field(p, "\t", widen)).join("")}}\n`;
	} else if (o.any_of) {
		out += `export type ${o.name} = ${o.any_of.map(fieldType).join(" | ")};\n`;
	} else {
		out += `export type ${o.name} = Record<never, never>;\n`;
	}

	return out;
};

const byName = (a, b) => (a.name < b.name ? -1 : 1);

// ---- format-field derivation: per-method map of text params that pair with a `*_entities`
// sibling. consumed twice: emitted as format-fields.ts for @yaebal/core's runtime splitting,
// and used right here to widen those same fields to `string | FormattedText` in telegram.ts,
// so the typed method surface (BotApiMethods) accepts what the runtime handles. the pairing
// is derived from field names: every `X_entities` sits next to its `X`, and a bare
// `entities` next to `message_text`/`text`.

const objectByName = new Map(schema.objects.map((o) => [o.name, o]));

// object names a field's value can be (follows arrays and any_of unions).
const fieldRefs = (f) => {
	if (!f) return [];
	if (f.type === "reference") return [f.reference];
	if (f.type === "array") return fieldRefs(f.array);
	if (f.type === "any_of") return (f.any_of ?? []).flatMap(fieldRefs);
	return [];
};

const pairsOf = (fields) => {
	const pairs = [];

	for (const f of fields) {
		if (f.name === "entities") {
			const base =
				fields.find((x) => x.name === "message_text") ?? fields.find((x) => x.name === "text");
			if (base) pairs.push({ field: base.name, entities: "entities" });
		} else if (f.name.endsWith("_entities")) {
			const base = f.name.slice(0, -"_entities".length);
			if (fields.some((x) => x.name === base)) pairs.push({ field: base, entities: f.name });
		}
	}

	return pairs;
};

const mergeSites = (lists) => {
	const merged = new Map();
	for (const list of lists) for (const site of list) merged.set(JSON.stringify(site), site);
	return [...merged.values()];
};

const specStack = new Set();
const specCache = new Map();

const objectSpec = (name) => {
	if (specCache.has(name)) return specCache.get(name);
	if (specStack.has(name)) return []; // cycle guard; input-side objects are acyclic in practice

	specStack.add(name);
	const o = objectByName.get(name);
	const spec = o?.any_of
		? mergeSites(fieldRefs({ type: "any_of", any_of: o.any_of }).map(objectSpec))
		: fieldsSpec(o?.properties ?? []);
	specStack.delete(name);

	specCache.set(name, spec);
	return spec;
};

const fieldsSpec = (fields) => {
	const spec = pairsOf(fields);
	const paired = new Set(spec.map((s) => s.field));

	for (const f of fields) {
		if (paired.has(f.name)) continue;

		const nested = mergeSites(fieldRefs(f).map(objectSpec));
		if (nested.length) spec.push({ field: f.name, nested });
	}

	return spec;
};

const methodSpecs = [...schema.methods]
	.sort(byName)
	.map((m) => [m.name, fieldsSpec(m.arguments ?? [])])
	.filter(([, spec]) => spec.length);

// which text fields to widen to `string | FormattedText` when emitting telegram.ts:
// - per method: the direct text/entities pairs of its params
// - per object: direct pairs of objects actually REACHABLE from some method's params
//   (specCache = everything objectSpec visited). response-only objects like `Message`
//   also carry text/entities pairs but must stay `string` — they never pass through
//   applyFormatFields, and widening them would lie about API responses.
const paramsWiden = new Map(
	schema.methods.map((m) => [m.name, new Set(pairsOf(m.arguments ?? []).map((p) => p.field))]),
);
const objectWiden = new Map(
	[...specCache.keys()]
		.map((name) => [
			name,
			new Set(pairsOf(objectByName.get(name)?.properties ?? []).map((p) => p.field)),
		])
		.filter(([, fields]) => fields.size > 0),
);

// ---- telegram.ts: the object/params/method-surface types ----

const updateObject = schema.objects.find((o) => o.name === "Update");
const updateNames = (updateObject?.properties ?? [])
	.map((p) => p.name)
	.filter((name) => name !== "update_id");

let body = `// AUTO-GENERATED from the Telegram Bot API schema — do not edit by hand.
// regenerate with: pnpm --filter @yaebal/types generate
// source: https://core.telegram.org/bots/api (scraped by scripts/lib/parse-schema.mjs)

/** the Telegram Bot API version these types were generated from. */
export const BOT_API_VERSION = ${JSON.stringify(schema.version?.major != null ? `${schema.version.major}.${schema.version.minor}` : String(schema.version))};

/** runtime list of \`Update\` payload keys (every update kind, excluding \`update_id\`). */
export const updateNames = [
${updateNames.map((name) => `\t${JSON.stringify(name)},`).join("\n")}
] as const;

/**
 * a formatted text value — the \`{ text, entities }\` shape \`format\`/\`fmt\` produce.
 * accepted wherever the schema pairs a text field with a \`*_entities\` sibling; the
 * api client splits it into the two wire params before sending (see \`formatFields\`).
 */
export interface FormattedText {
	text: string;
	entities: MessageEntity[];
}

`;

for (const o of [...schema.objects].sort(byName)) body += `${emitObject(o, objectWiden.get(o.name))}\n`;

const methodSigs = [];
for (const m of [...schema.methods].sort(byName)) {
	const iface = `${pascal(m.name)}Params`;
	const widen = paramsWiden.get(m.name);

	if (m.arguments?.length) {
		body += `${jsdoc(m.description)}export interface ${iface} {\n${m.arguments.map((a) => field(a, "\t", widen)).join("")}}\n\n`;
	} else {
		body += `${jsdoc(m.description)}export type ${iface} = Record<never, never>;\n\n`;
	}

	const ret = m.return_type ? fieldType(m.return_type) : "unknown";
	const hasRequired = (m.arguments ?? []).some((a) => a.required);

	methodSigs.push(`\t${jsdoc(m.description, "\t")}\t${m.name}(params${hasRequired ? "" : "?"}: ${iface}): Promise<${ret}>;`);
}

body += `/** every Telegram Bot API method, fully typed. */\nexport interface BotApiMethods {\n${methodSigs.join("\n")}\n}\n`;

writeFileSync(new URL("src/telegram.ts", root), body);
console.log(
	`generated src/telegram.ts: ${schema.objects.length} objects, ${schema.methods.length} methods, ${objectWiden.size} format-widened objects (Telegram Bot API ${BOT_API_VERSION_LOG(schema)})`,
);

const renderSite = (site, indent) =>
	site.nested
		? `${indent}{ field: ${JSON.stringify(site.field)}, nested: [\n${site.nested
				.map((n) => renderSite(n, `${indent}\t`))
				.join("\n")}\n${indent}] },`
		: `${indent}{ field: ${JSON.stringify(site.field)}, entities: ${JSON.stringify(site.entities)} },`;

const formatFieldsBody = `// AUTO-GENERATED from the Telegram Bot API schema — do not edit by hand.
// regenerate with: pnpm --filter @yaebal/types generate

/**
 * one spot in a method's params that carries user-visible text. either a pair —
 * \`field\` holds the text and \`entities\` names the sibling \`MessageEntity[]\`
 * param — or a container: walk into \`field\` (an object or an array of objects)
 * and apply the \`nested\` sites there.
 */
export interface FormatFieldSpec {
	field: string;
	entities?: string;
	nested?: readonly FormatFieldSpec[];
}

/**
 * for every Bot API method that accepts formatted text: where that text lives in
 * the params, including nested spots (\`reply_parameters.quote\`, poll options,
 * media groups, inline results, checklists, …). derived from the schema by
 * pairing each \`X_entities\` field with its sibling \`X\`.
 */
export const formatFields: Readonly<Record<string, readonly FormatFieldSpec[]>> = {
${methodSpecs
	.map(([name, spec]) => `\t${name}: [\n${spec.map((s) => renderSite(s, "\t\t")).join("\n")}\n\t],`)
	.join("\n")}
};
`;

writeFileSync(new URL("src/format-fields.ts", root), formatFieldsBody);
console.log(`generated src/format-fields.ts: ${methodSpecs.length} methods with format fields`);

function BOT_API_VERSION_LOG(s) {
	return s.version?.major != null ? `${s.version.major}.${s.version.minor}` : s.version;
}
