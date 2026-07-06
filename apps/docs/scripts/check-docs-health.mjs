import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
const typecheckedSnippetPages = ["docs/reference"];

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

	for (const match of source.matchAll(/<Code\s+[^>]*\bcode=\{(\w+)\}/g)) {
		const code = snippets.get(match[1]);

		if (code === undefined) {
			errors.push(`${relative(repoRoot, page)} <Code code={${match[1]}}> has no static snippet`);
			continue;
		}

		snippetFiles.push({ name: `${route.replaceAll("/", "-")}-${match[1]}.ts`, code });
	}
}

if (snippetFiles.length > 0) {
	const dir = mkdtempSync(join(tmpdir(), "yaebal-docs-snippets-"));

	try {
		for (const { name, code } of snippetFiles) writeFileSync(join(dir, name), `${code}\n`);

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
						lib: ["esnext", "dom"],
						types: ["node"],
						typeRoots: [join(repoRoot, "node_modules", "@types")],
						// resolve workspace packages straight to source — no build required.
						paths: {
							yaebal: [join(repoRoot, "packages", "yaebal", "src", "index.ts")],
							"@yaebal/*": [join(repoRoot, "packages", "*", "src", "index.ts")],
						},
						noEmit: true,
						skipLibCheck: true,
					},
					include: ["*.ts"],
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
