// generates data/*.json for the mcp server from the monorepo sources.
// run from packages/ai: `node scripts/build-data.mjs` (root: `pnpm --filter @yaebal/ai generate`).
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..", "..");
const dataDir = join(packageRoot, "data");
mkdirSync(dataDir, { recursive: true });

const read = (path) => readFileSync(path, "utf8");
const exists = (path) => {
	try {
		statSync(path);
		return true;
	} catch {
		return false;
	}
};
const dirs = (path) =>
	readdirSync(path, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
		.map((entry) => entry.name)
		.sort();

// --- plugins.json: every published package, with its readme -----------------------------
const docsRoutes = join(repoRoot, "apps", "docs", "src", "routes", "docs");
const docsUrlFor = (name) => {
	const special = {
		core: "/docs/core/",
		contexts: "/docs/contexts/",
		types: "/docs/api/",
		yaebal: "/docs/yaebal/",
		ai: "/docs/plugins/ai/",
	};
	const route = special[name] ?? `/docs/plugins/${name}/`;
	const routeDir = join(docsRoutes, ...route.replace(/^\/docs\/|\/$/g, "").split("/"));
	return exists(join(routeDir, "+page.svelte")) ? `https://yaebal.mom${route}` : undefined;
};

const plugins = [];
for (const name of dirs(join(repoRoot, "packages"))) {
	const dir = join(repoRoot, "packages", name);
	if (!exists(join(dir, "package.json")) || !exists(join(dir, "README.md"))) continue;
	const manifest = JSON.parse(read(join(dir, "package.json")));
	if (manifest.private === true) continue;
	plugins.push({
		name,
		package: manifest.name,
		description: manifest.description ?? "",
		...(docsUrlFor(name) === undefined ? {} : { docs: docsUrlFor(name) }),
		readme: read(join(dir, "README.md")),
	});
}
writeFileSync(join(dataDir, "plugins.json"), `${JSON.stringify(plugins, null, "\t")}\n`);

// --- examples.json: every runnable example with its entry source ------------------------
const examples = [];
for (const name of dirs(join(repoRoot, "examples"))) {
	const dir = join(repoRoot, "examples", name);
	const srcDir = join(dir, "src");
	if (!exists(srcDir)) continue;

	let description = "";
	if (exists(join(dir, "README.md"))) {
		const lines = read(join(dir, "README.md")).split("\n");
		description = lines.find((line) => line.trim().length > 0 && !line.startsWith("#")) ?? "";
	}
	if (description === "" && exists(join(dir, "package.json"))) {
		description = JSON.parse(read(join(dir, "package.json"))).description ?? "";
	}

	const files = readdirSync(srcDir)
		.filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
		.sort((a, b) => (a === "index.ts" ? -1 : b === "index.ts" ? 1 : a.localeCompare(b)));
	const source = files
		.map((file) =>
			files.length > 1 ? `// ${file}\n${read(join(srcDir, file))}` : read(join(srcDir, file)),
		)
		.join("\n");

	examples.push({ name, description: description.trim(), source });
}
writeFileSync(join(dataDir, "examples.json"), `${JSON.stringify(examples, null, "\t")}\n`);

// --- docs.json: the llms-full.txt digest, sectioned by heading --------------------------
const sections = [];
const fullPath = join(repoRoot, "apps", "docs", "static", "llms-full.txt");
if (exists(fullPath)) {
	const chunks = read(fullPath).split(/\n(?=## )/);
	for (const chunk of chunks) {
		const heading = chunk.match(/^#+ (.+)$/m)?.[1] ?? "yaebal";
		const url = chunk.match(/https:\/\/yaebal\.mom[^\s)"]*/)?.[0];
		sections.push({
			title: heading.trim(),
			...(url === undefined ? {} : { url }),
			text: chunk.trim(),
		});
	}
}
writeFileSync(join(dataDir, "docs.json"), `${JSON.stringify(sections, null, "\t")}\n`);

console.log(
	`data built: ${plugins.length} plugins, ${examples.length} examples, ${sections.length} doc sections`,
);
