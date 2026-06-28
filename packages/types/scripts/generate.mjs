// generates src/telegram.ts from the machine-readable Telegram Bot API schema (schema.json).
// run: node scripts/generate.mjs (re-run after refreshing schema.json)
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const schema = JSON.parse(readFileSync(new URL("schema.json", root), "utf8"));

const fieldType = (node) => {
	switch (node?.type) {
		case "integer":
		case "float":
			return "number";
		case "string":
			return Array.isArray(node.enum) ? node.enum.map((v) => JSON.stringify(v)).join(" | ") : "string";
		case "bool":
			return "boolean";
		case "reference":
			return node.reference;
		case "array": {
			const inner = fieldType(node.array);
			return inner.includes("|") ? `(${inner})[]` : `${inner}[]`;
		}
		case "any_of":
			return node.any_of.map(fieldType).join(" | ");
		default:
			return "unknown";
	}
};

const jsdoc = (desc, indent = "") => {
	if (!desc) return "";

	const clean = desc.replace(/\r?\n/g, " ").replace(/\*\//g, "*\\/").trim();
	return `${indent}/** ${clean} */\n`;
};

const field = (f, indent = "\t") =>
	`${jsdoc(f.description, indent)}${indent}${f.name}${f.required ? "" : "?"}: ${fieldType(f)};\n`;

const pascal = (name) => name[0].toUpperCase() + name.slice(1);

const emitObject = (o) => {
	let out = jsdoc(o.description);

	if (o.properties) {
		out += `export interface ${o.name} {\n${o.properties.map((p) => field(p)).join("")}}\n`;
	} else if (o.any_of) {
		out += `export type ${o.name} = ${o.any_of.map(fieldType).join(" | ")};\n`;
	} else {
		out += `export type ${o.name} = Record<never, never>;\n`;
	}

	return out;
};

const byName = (a, b) => (a.name < b.name ? -1 : 1);

let body = `// AUTO-GENERATED from the Telegram Bot API schema — do not edit by hand.
// regenerate with: pnpm --filter @yaebal/types generate
// source: https://ark0f.github.io/tg-bot-api/

/** the Telegram Bot API version these types were generated from. */
export const BOT_API_VERSION = ${JSON.stringify(schema.version?.major != null ? `${schema.version.major}.${schema.version.minor}` : String(schema.version))};

`;

for (const o of [...schema.objects].sort(byName)) body += `${emitObject(o)}\n`;

const methodSigs = [];
for (const m of [...schema.methods].sort(byName)) {
	const iface = `${pascal(m.name)}Params`;

	if (m.arguments?.length) {
		body += `${jsdoc(m.description)}export interface ${iface} {\n${m.arguments.map((a) => field(a)).join("")}}\n\n`;
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
	`generated src/telegram.ts: ${schema.objects.length} objects, ${schema.methods.length} methods (Telegram Bot API ${BOT_API_VERSION_LOG(schema)})`,
);

function BOT_API_VERSION_LOG(s) {
	return s.version?.major != null ? `${s.version.major}.${s.version.minor}` : s.version;
}
