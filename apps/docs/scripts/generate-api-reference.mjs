// generates the Bot API reference under apps/docs/src/routes/docs/api/ from
// packages/types/schema.json — the same single source of truth @yaebal/types and
// @yaebal/contexts are generated from. does NOT re-parse or re-scrape anything: type
// rendering is imported straight from @yaebal/types' own generator, and "usage in yaebal"
// context-shortcut examples are scanned out of @yaebal/contexts' actual generated/hand-
// written source, not reimplemented.
//
// run: node scripts/generate-api-reference.mjs  (from apps/docs/)

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fieldType, pascal } from "../../../packages/types/scripts/lib/render-type.mjs";

const repoRoot = new URL("../../../", import.meta.url);
const docsRoot = new URL("../", import.meta.url);

const schema = JSON.parse(readFileSync(new URL("packages/types/schema.json", repoRoot), "utf8"));
const BOT_API_VERSION = `${schema.version.major}.${schema.version.minor}`;

const allNames = new Set([...schema.methods.map((m) => m.name), ...schema.objects.map((o) => o.name)]);
const nameByLower = new Map([...allNames].map((n) => [n.toLowerCase(), n]));

// ---------------------------------------------------------------------------------------
// which methods are directly typed on `Api` (packages/core/src/api.ts) — parsed from the
// real interface, not a hand-maintained list, so newly promoted methods show up for free.
// ---------------------------------------------------------------------------------------

function extractApiShortcuts() {
	const text = readFileSync(new URL("packages/core/src/api.ts", repoRoot), "utf8");
	const ifaceMatch = text.match(/export interface Api \{([\s\S]*?)\n\}/);
	if (!ifaceMatch) throw new Error("generate-api-reference: couldn't find `interface Api` in api.ts");

	const excluded = new Set(["call", "before", "after", "onError", "fileUrl"]);
	const names = new Set();

	for (const m of ifaceMatch[1].matchAll(/\n\t(\w+)\(/g)) {
		if (!excluded.has(m[1])) names.add(m[1]);
	}

	return names;
}

const apiShortcutNames = extractApiShortcuts();

// ---------------------------------------------------------------------------------------
// context shortcuts (ctx.reply, ctx.sendPhoto, ctx.react, ...) — scanned out of the actual
// generated/hand-written source in packages/core/src/context.ts and
// packages/contexts/src/generated/*.ts. each method body is matched back to the Telegram
// method it calls via `this.api.call<T>("method", ...)` or the direct `this.api.method(...)`
// shortcuts on `Api` itself.
// ---------------------------------------------------------------------------------------

const methodNameSet = new Set(schema.methods.map((m) => m.name));

function extractShortcutsFromSource(text) {
	const out = [];
	const methodRe = /\/\*\*([\s\S]*?)\*\/\n\t(\w+)\(([^)]*)\)(?:\s*:\s*[^{]+)?\s*\{/g;
	let m = methodRe.exec(text);

	while (m !== null) {
		const jsdoc = m[1]
			.split("\n")
			.map((line) => line.replace(/^[ \t]*\*?[ \t]?/, "").trim())
			.filter(Boolean)
			.join(" ");
		const name = m[2];
		const paramsSrc = m[3].replace(/\bt\./g, "");

		let depth = 1;
		let i = m.index + m[0].length;
		while (i < text.length && depth > 0) {
			if (text[i] === "{") depth++;
			else if (text[i] === "}") depth--;
			i++;
		}
		const body = text.slice(m.index + m[0].length, i - 1);

		const callMatch = body.match(/this\.api\.call<[^>]*>\("(\w+)"/);
		let telegramMethod = callMatch ? callMatch[1] : undefined;
		if (!telegramMethod) {
			const directMatch = body.match(/this\.api\.(\w+)\(/);
			if (directMatch && methodNameSet.has(directMatch[1])) telegramMethod = directMatch[1];
		}

		if (telegramMethod && methodNameSet.has(telegramMethod)) {
			out.push({ telegramMethod, name, signature: `${name}(${paramsSrc})`, jsdoc });
		}

		m = methodRe.exec(text);
	}

	return out;
}

function buildContextShortcuts() {
	const generatedDir = new URL("packages/contexts/src/generated/", repoRoot);
	const generatedFiles = readdirSync(generatedDir)
		.filter((f) => f.endsWith(".ts") && f !== "index.ts" && f !== "message.ts")
		.sort();

	// order matters: earlier files "win" as the representative example for a given method.
	// core/context.ts (hand-written, nicest prose) first, then the flagship message.ts
	// context, then everything else alphabetically.
	const sources = [
		"packages/core/src/context.ts",
		"packages/contexts/src/generated/message.ts",
		...generatedFiles.map((f) => `packages/contexts/src/generated/${f}`),
	];

	const shortcuts = new Map();

	for (const rel of sources) {
		const text = readFileSync(new URL(rel, repoRoot), "utf8");
		for (const s of extractShortcutsFromSource(text)) {
			const existing = shortcuts.get(s.telegramMethod);
			if (!existing) {
				shortcuts.set(s.telegramMethod, {
					name: s.name,
					signature: s.signature,
					jsdoc: s.jsdoc,
					availableOn: 1,
				});
			} else {
				existing.availableOn++;
			}
		}
	}

	return shortcuts;
}

const contextShortcuts = buildContextShortcuts();

// ---------------------------------------------------------------------------------------
// cross-reference index: which methods/types reference a given type (for "used by" lists).
// ---------------------------------------------------------------------------------------

function collectRefs(node, set) {
	if (!node) return;
	if (node.type === "reference") set.add(node.reference);
	else if (node.type === "array") collectRefs(node.array, set);
	else if (node.type === "any_of") for (const n of node.any_of) collectRefs(n, set);
}

const usedByMethods = new Map();
const usedByTypes = new Map();

for (const m of schema.methods) {
	const refs = new Set();
	for (const a of m.arguments ?? []) collectRefs(a, refs);
	collectRefs(m.return_type, refs);

	for (const r of refs) {
		if (!usedByMethods.has(r)) usedByMethods.set(r, new Set());
		usedByMethods.get(r).add(m.name);
	}
}

for (const o of schema.objects) {
	const refs = new Set();
	if (o.properties) for (const p of o.properties) collectRefs(p, refs);
	if (o.any_of) for (const v of o.any_of) collectRefs(v, refs);

	for (const r of refs) {
		if (r === o.name) continue;
		if (!usedByTypes.has(r)) usedByTypes.set(r, new Set());
		usedByTypes.get(r).add(o.name);
	}
}

// ---------------------------------------------------------------------------------------
// description rendering: schema descriptions are markdown-ish text (see
// packages/types/scripts/lib/html.mjs's htmlToMarkdown) — `[text](url)`, `**bold**`,
// `*italic*`, `` `code` ``, `\_`-escaped underscores. rendered once here (not at runtime),
// with links to other Bot API entities rewritten to our own internal routes.
// ---------------------------------------------------------------------------------------

function escapeHtml(s) {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function routeFor(name) {
	return methodNameSet.has(name) ? `/docs/api/methods/${name}` : `/docs/api/types/${name}`;
}

function renderInline(md) {
	let text = escapeHtml(md).replace(/\\_/g, "_");

	text = text.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
	text = text.replace(/\*\*([^*]+)\*\*/g, (_, b) => `<strong>${b}</strong>`);
	text = text.replace(/\*([^*]+)\*/g, (_, i) => `<em>${i}</em>`);
	text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
		let href = url;

		const anchorMatch = href.match(/^https:\/\/core\.telegram\.org\/bots\/api\/#([a-zA-Z0-9]+)$/);
		if (anchorMatch) {
			const target = nameByLower.get(anchorMatch[1].toLowerCase());
			if (target) href = routeFor(target);
		} else if (href.startsWith("/")) {
			href = `https://core.telegram.org${href}`;
		}

		const external = href.startsWith("http");
		return `<a href="${href}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${label}</a>`;
	});

	return text;
}

function renderDescription(md) {
	if (!md) return "";

	const paragraphs = renderInline(md)
		.split(/\n{2,}/)
		.map((p) => p.trim())
		.filter(Boolean);

	return paragraphs.map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("\n");
}

function renderFieldDescription(md) {
	if (!md) return "";
	return renderInline(md).replace(/\n/g, "<br>");
}

// ---------------------------------------------------------------------------------------
// "usage in yaebal" example code — real @yaebal/types imports, real @yaebal/core calling
// conventions (see packages/types/src/index.ts's own documented `.call<T>()` pattern).
// ---------------------------------------------------------------------------------------

function fieldHasInputFile(field) {
	if (field.type === "reference") return field.reference === "InputFile";
	if (field.type === "any_of") return field.any_of.some(fieldHasInputFile);
	return false;
}

function exampleValue(field) {
	switch (field.type) {
		case "any_of":
			if (fieldHasInputFile(field)) return `media.url("https://picsum.photos/400")`;
			return exampleValue({ ...field.any_of[0], name: field.name });
		case "reference":
			return `{} /* ${field.reference} */`;
		case "array":
			return "[]";
		case "integer":
		case "float":
			if (["chat_id", "user_id", "from_chat_id"].includes(field.name)) return "123456789";
			if (field.name && /message_id$/i.test(field.name)) return "1";
			return "1";
		case "bool":
			return "true";
		case "string":
			if (Array.isArray(field.enum) && field.enum.length) return JSON.stringify(field.enum[0]);
			if (field.name === "text" || field.name === "caption") return `"hello from yaebal!"`;
			return `"..."`;
		default:
			return "undefined";
	}
}

function buildParamsLiteral(args) {
	const required = (args ?? []).filter((a) => a.required);
	if (!required.length) return "{}";

	const lines = required.map((a) => `  ${a.name}: ${exampleValue(a)},`);
	return `{\n${lines.join("\n")}\n}`;
}

function buildUsageExample(method, isApiShortcut) {
	const hasArgs = (method.arguments?.length ?? 0) > 0;
	const paramsIface = `${pascal(method.name)}Params`;
	const paramsLiteral = buildParamsLiteral(method.arguments);
	const usesMedia = (method.arguments ?? []).some((a) => a.required && fieldHasInputFile(a));

	const valueImports = usesMedia ? [`import { media } from "@yaebal/core";`] : [];

	const typeNames = new Set();
	if (hasArgs) typeNames.add(paramsIface);

	let returnTypeStr = "";
	if (!isApiShortcut) {
		const refs = new Set();
		collectRefs(method.return_type, refs);
		for (const r of refs) typeNames.add(r);
		returnTypeStr = fieldType(method.return_type ?? { type: "unknown" });
	}

	const typeImportLine = typeNames.size
		? `import type { ${[...typeNames].sort().join(", ")} } from "@yaebal/types";`
		: "";

	const importBlock = [...valueImports, typeImportLine].filter(Boolean).join("\n");

	const callExpr = isApiShortcut
		? `await bot.api.${method.name}(${hasArgs ? `${paramsLiteral} satisfies ${paramsIface}` : ""});`
		: `await bot.api.call<${returnTypeStr}>("${method.name}"${hasArgs ? `, ${paramsLiteral} satisfies ${paramsIface}` : ""});`;

	return importBlock ? `${importBlock}\n\n${callExpr}` : callExpr;
}

// ---------------------------------------------------------------------------------------
// assemble the data
// ---------------------------------------------------------------------------------------

function renderParams(fields) {
	return (fields ?? []).map((f) => ({
		name: f.name,
		type: fieldType(f),
		required: f.required,
		description: renderFieldDescription(f.description),
	}));
}

let shortcutHits = 0;

const apiMethods = schema.methods.map((m) => {
	const isApiShortcut = apiShortcutNames.has(m.name);
	const shortcut = contextShortcuts.get(m.name);
	if (shortcut) shortcutHits++;

	return {
		name: m.name,
		category: m.category,
		description: renderDescription(m.description),
		params: renderParams(m.arguments),
		returnType: fieldType(m.return_type ?? { type: "unknown" }),
		documentationLink: m.documentation_link,
		isApiShortcut,
		usageExample: buildUsageExample(m, isApiShortcut),
		contextShortcut: shortcut
			? {
					name: shortcut.name,
					signature: shortcut.signature,
					jsdoc: shortcut.jsdoc,
					availableOn: shortcut.availableOn,
				}
			: undefined,
	};
});

const apiTypes = schema.objects.map((o) => {
	const kind = o.properties ? "properties" : o.any_of ? "any_of" : "empty";

	return {
		name: o.name,
		category: o.category,
		description: renderDescription(o.description),
		kind,
		fields: kind === "properties" ? renderParams(o.properties) : [],
		variants: kind === "any_of" ? o.any_of.map((v) => v.reference ?? fieldType(v)) : [],
		documentationLink: o.documentation_link,
		usedByMethods: [...(usedByMethods.get(o.name) ?? [])].sort(),
		usedByTypes: [...(usedByTypes.get(o.name) ?? [])].sort(),
	};
});

const categoryOrder = schema.category_order ?? [];
const categoriesMap = new Map(categoryOrder.map((c) => [c, { title: c, methods: [], types: [] }]));

for (const m of schema.methods) {
	if (!categoriesMap.has(m.category)) categoriesMap.set(m.category, { title: m.category, methods: [], types: [] });
	categoriesMap.get(m.category).methods.push(m.name);
}
for (const o of schema.objects) {
	if (!categoriesMap.has(o.category)) categoriesMap.set(o.category, { title: o.category, methods: [], types: [] });
	categoriesMap.get(o.category).types.push(o.name);
}

const apiCategories = [...categoriesMap.values()];

// ---------------------------------------------------------------------------------------
// write src/lib/api/data.generated.ts
// ---------------------------------------------------------------------------------------

const dataModule = `// AUTO-GENERATED by apps/docs/scripts/generate-api-reference.mjs — do not edit by hand.
// source of truth: packages/types/schema.json (the same file @yaebal/types and
// @yaebal/contexts generate from). regenerate: pnpm --filter @yaebal/docs generate:api

export const BOT_API_VERSION = ${JSON.stringify(BOT_API_VERSION)};

export interface ApiField {
	name: string;
	type: string;
	required: boolean;
	description: string;
}

export interface ApiContextShortcut {
	name: string;
	signature: string;
	jsdoc: string;
	availableOn: number;
}

export interface ApiMethodDoc {
	name: string;
	category: string;
	description: string;
	params: ApiField[];
	returnType: string;
	documentationLink: string;
	isApiShortcut: boolean;
	usageExample: string;
	contextShortcut?: ApiContextShortcut;
}

export interface ApiTypeDoc {
	name: string;
	category: string;
	description: string;
	kind: "properties" | "any_of" | "empty";
	fields: ApiField[];
	variants: string[];
	documentationLink: string;
	usedByMethods: string[];
	usedByTypes: string[];
}

export interface ApiCategory {
	title: string;
	methods: string[];
	types: string[];
}

export const apiMethods: ApiMethodDoc[] = ${JSON.stringify(apiMethods, null, "\t")};

export const apiTypes: ApiTypeDoc[] = ${JSON.stringify(apiTypes, null, "\t")};

export const apiCategories: ApiCategory[] = ${JSON.stringify(apiCategories, null, "\t")};

export const apiMethodsByName = new Map(apiMethods.map((m) => [m.name, m]));
export const apiTypesByName = new Map(apiTypes.map((t) => [t.name, t]));
`;

mkdirSync(new URL("src/lib/api/", docsRoot), { recursive: true });
writeFileSync(new URL("src/lib/api/data.generated.ts", docsRoot), dataModule);

// ---------------------------------------------------------------------------------------
// write one +page.svelte per method / type
// ---------------------------------------------------------------------------------------

function writePages(dirName, names, component) {
	const dir = new URL(`src/routes/docs/api/${dirName}/`, docsRoot);
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });

	for (const name of names) {
		const pageDir = new URL(`${name}/`, dir);
		mkdirSync(pageDir, { recursive: true });
		writeFileSync(
			new URL("+page.svelte", pageDir),
			`<script lang="ts">
\timport ${component} from "$lib/api/${component}.svelte";
</script>

<${component} name={${JSON.stringify(name)}} />
`,
		);
	}
}

writePages(
	"methods",
	schema.methods.map((m) => m.name),
	"ApiMethodPage",
);
writePages(
	"types",
	schema.objects.map((o) => o.name),
	"ApiTypePage",
);

console.log(
	`generated Bot API reference: ${schema.methods.length} method pages, ${schema.objects.length} type pages ` +
		`(Bot API ${BOT_API_VERSION}); ${shortcutHits}/${schema.methods.length} methods resolved a context-shortcut example`,
);
