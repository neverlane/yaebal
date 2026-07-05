import { existsSync, readFileSync, readdirSync } from "node:fs";
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

if (errors.length > 0) {
	console.error("docs health failed:");
	for (const error of errors) console.error(`- ${error}`);
	process.exit(1);
}

console.log(`docs health ok: ${exampleIds.size} examples, ${docsPages.length} docs pages`);
