import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const docsRoot = join(here, "..");
const repoRoot = join(docsRoot, "..", "..");
const srcRoot = join(docsRoot, "src");

const errors = [];

function read(path) {
	return readFileSync(path, "utf8");
}

function walk(dir, predicate = () => true) {
	const files = [];

	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);

		if (entry.isDirectory()) files.push(...walk(path, predicate));
		else if (predicate(path)) files.push(path);
	}

	return files;
}

function routePath(href) {
	const clean = href.replace(/\/$/, "").replace(/^\//, "");
	return join(srcRoot, "routes", clean, "+page.svelte");
}

const examplesSource = read(join(srcRoot, "lib", "examples.ts"));
const exampleIds = new Set([...examplesSource.matchAll(/^\s*"([^"]+)":\s*{/gm)].map((m) => m[1]));

const docsPages = walk(join(srcRoot, "routes", "docs"), (path) => path.endsWith(".svelte"));
for (const page of docsPages) {
	const source = read(page);
	for (const match of source.matchAll(/<Try\s+[^>]*\bid="([^"]+)"/g)) {
		const id = match[1];
		if (!exampleIds.has(id)) {
			errors.push(`${relative(repoRoot, page)} references missing try example "${id}"`);
		}
	}
}

// the examples/recipes catalog is generated from examples/README.md (generate-examples-catalog.mjs).
// catch drift between the generated file and the actual examples/ workspace directories so a new
// bot added to the repo without regenerating the catalog fails ci instead of silently vanishing
// from the docs site.
const catalogSource = read(join(srcRoot, "lib", "examples-catalog.ts"));
const catalogNames = new Set([...catalogSource.matchAll(/"name":\s*"([^"]+)"/g)].map((m) => m[1]));
const exampleDirs = new Set(
	readdirSync(join(repoRoot, "examples"), { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name),
);

for (const dir of exampleDirs) {
	if (!catalogNames.has(dir)) {
		errors.push(
			`examples/${dir} is missing from the generated examples catalog — run "pnpm generate:examples"`,
		);
	}
}
for (const name of catalogNames) {
	if (!exampleDirs.has(name)) {
		errors.push(
			`generated examples catalog references "${name}", but examples/${name} does not exist — run "pnpm generate:examples"`,
		);
	}
}

const navSource = read(join(srcRoot, "lib", "nav.ts"));
for (const match of navSource.matchAll(/href:\s*"(\/docs[^"]*)"/g)) {
	const href = match[1];
	const page = routePath(href);

	if (!existsSync(page)) errors.push(`nav href "${href}" has no route at ${relative(repoRoot, page)}`);
}

const lowercaseSensitiveFiles = [
	...docsPages,
	join(srcRoot, "lib", "Sidebar.svelte"),
	join(srcRoot, "lib", "Toc.svelte"),
];

for (const file of lowercaseSensitiveFiles) {
	const source = read(file);
	if (/text-transform:\s*uppercase/i.test(source)) {
		errors.push(`${relative(repoRoot, file)} uses text-transform: uppercase`);
	}
}

// pages whose <Code> snippets are self-contained typescript modules, typechecked below.
const typecheckedSnippetPages = [
	"docs/reference",
	"docs/introduction",
	"docs/yaebal",
	"docs/getting-started",
	"docs/core",
	"docs/context",
	"docs/contexts",
	"docs/media",
	"docs/hooks",
	"docs/webhooks",
	"docs/typed-examples",
	"docs/cheat-sheet",
	"docs/faq",
	"docs/troubleshooting",
	"docs/production/observability",
	"docs/production/queues-broadcasts",
	"docs/production/local-bot-api",
	"docs/production/deploy-targets",
	"docs/production/rate-limits",
	"docs/telegram/payments",
	"docs/telegram/inline-mode",
	"docs/telegram/chat-admin",
	"docs/telegram/service-events",
	"docs/telegram/message-extras",
	"docs/telegram/deep-links",
	"docs/telegram/mini-apps",
	"docs/runtimes",
];

function extractSnippets(source) {
	const snippets = new Map();

	for (const match of source.matchAll(/const\s+(\w+)\s*=\s*`/g)) {
		const start = match.index + match[0].length;
		let end = start;

		while (end < source.length && source[end] !== "`") {
			if (source[end] === "\\") end += 1;
			end += 1;
		}
		if (end >= source.length) continue;

		const raw = source.slice(start, end);
		if (/(?<!\\)\$\{/.test(raw)) continue; // interpolated — not a static snippet

		snippets.set(match[1], raw.replace(/\\([\\`$])/g, "$1"));
	}

	return snippets;
}

const snippetFiles = [];
for (const route of typecheckedSnippetPages) {
	const page = join(srcRoot, "routes", route, "+page.svelte");
	const source = read(page);
	const snippets = extractSnippets(source);

	for (const match of source.matchAll(/<Code\s+([^>]*?)\/>/g)) {
		const attrs = match[1];
		const codeMatch = attrs.match(/\bcode=\{(\w+)\}/);
		if (!codeMatch) continue;

		// Code.svelte defaults `lang` to "ts" — only typecheck actual typescript snippets,
		// not the sh/yaml/dotenv/json ones that share the same <Code> component.
		const langMatch = attrs.match(/\blang="([^"]*)"/);
		const lang = langMatch ? langMatch[1] : "ts";
		if (lang !== "ts" && lang !== "typescript") continue;

		const name = codeMatch[1];
		const code = snippets.get(name);

		if (code === undefined) {
			errors.push(`${relative(repoRoot, page)} <Code code={${name}}> has no static snippet`);
			continue;
		}

		// snippets on the same page that reference each other by relative import (e.g. a
		// "bot.ts" + "main.ts" pair) need to land as real sibling files, named from the
		// <Code title="…"> shown on the page, in a directory scoped to that page — otherwise
		// `import { bot } from "./bot.js"` can't resolve and every page collides on generic
		// names like "bot.ts".
		const titleMatch = attrs.match(/\btitle="([^"]*)"/);
		const title = titleMatch?.[1];
		const fileName = title && /^[\w.-]+\.tsx?$/.test(title) ? title : `${name}.ts`;
		const pageDir = route.replaceAll("/", "-");

		snippetFiles.push({ dir: pageDir, fileName, code });
	}
}

if (snippetFiles.length > 0) {
	const dir = mkdtempSync(join(tmpdir(), "yaebal-docs-snippets-"));

	try {
		for (const { dir: pageDir, fileName, code } of snippetFiles) {
			mkdirSync(join(dir, pageDir), { recursive: true });
			writeFileSync(join(dir, pageDir, fileName), `${code}\n`);
		}

		// docs snippets suggest `vitest` as the reader's own test runner — it isn't a real
		// dependency anywhere in this monorepo, so give the sandbox a minimal ambient shim
		// instead of failing every "bot.test.ts" snippet on a missing module.
		writeFileSync(
			join(dir, "vitest-shim.d.ts"),
			`declare module "vitest" {
	export function test(name: string, fn: () => unknown | Promise<unknown>): void;
	export function expect<T>(actual: T): {
		toBe(expected: T): void;
		toEqual(expected: unknown): void;
		toContain(expected: unknown): void;
		toBeDefined(): void;
	};
}
`,
		);

		writeFileSync(join(dir, "package.json"), `${JSON.stringify({ type: "module" }, null, "\t")}\n`);
		writeFileSync(
			join(dir, "tsconfig.json"),
			`${JSON.stringify(
				{
					compilerOptions: {
						strict: true,
						noUncheckedIndexedAccess: true,
						module: "nodenext",
						moduleResolution: "nodenext",
						target: "esnext",
						// matches the real packages' tsconfig.base.json (no "dom"): Node's own
						// fetch/Request/Response globals come from @types/node, and mixing in
						// lib.dom.d.ts's slightly different RequestInit shadows them (e.g. its
						// RequestInit has no "duplex", which @yaebal/core/node genuinely needs).
						lib: ["esnext"],
						types: ["node"],
						typeRoots: [join(repoRoot, "node_modules", "@types")],
						// resolve workspace packages straight to source — no build required.
						paths: {
							yaebal: [join(repoRoot, "packages", "yaebal", "src", "index.ts")],
							// subpath exports (package.json "exports") that aren't "./*" → "src/*.ts" —
							// add here as snippets start using them.
							"@yaebal/core/node": [join(repoRoot, "packages", "core", "src", "node.ts")],
							"@yaebal/*": [join(repoRoot, "packages", "*", "src", "index.ts")],
						},
						noEmit: true,
						skipLibCheck: true,
					},
					include: ["**/*.ts"],
				},
				null,
				"\t",
			)}\n`,
		);

		const tsc = join(repoRoot, "node_modules", "typescript", "bin", "tsc");
		const result = spawnSync(process.execPath, [tsc, "-p", dir], { encoding: "utf8" });

		if (result.status !== 0) {
			const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
			errors.push(`snippet typecheck failed (file names map to page + snippet const):\n${output}`);
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

if (errors.length > 0) {
	console.error("docs health failed:");
	for (const error of errors) console.error(`- ${error}`);
	process.exit(1);
}

console.log(
	`docs health ok: ${exampleIds.size} examples, ${docsPages.length} docs pages, ${snippetFiles.length} typechecked snippets`,
);
