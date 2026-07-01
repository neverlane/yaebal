// fetches the live Telegram Bot API docs, and if a newer Bot API version is out, refreshes
// schema.json + regenerates @yaebal/types and @yaebal/contexts, bumping their versions.
//
// `@yaebal/types`'s version *is* the Bot API version it was generated from (e.g. `10.1.0`) —
// `@yaebal/contexts` gets a plain patch bump, since its own version tracks its own codegen
// output, not the API version directly.
//
// run: node scripts/update-schema.mjs [--force]
// --force: regenerate even if the parsed version isn't newer than the committed one (useful to
// pick up docs wording/field changes that don't bump the version number).

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

import { fetchApiHtml, parseSchema } from "./lib/parse-schema.mjs";

const root = new URL("../", import.meta.url);
const typesPkgPath = new URL("package.json", root);
const contextsPkgPath = new URL("../contexts/package.json", root);
const schemaPath = new URL("schema.json", root);

const FORCE = process.argv.includes("--force");

const readJson = (url) => JSON.parse(readFileSync(url, "utf8"));

function compareVersions(a, b) {
	return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

function bumpPatch(version) {
	const parts = version.split(".").map(Number);
	parts[2] = (parts[2] ?? 0) + 1;
	return parts.join(".");
}

function githubOutput(key, value) {
	const file = process.env.GITHUB_OUTPUT;
	if (file) appendFileSync(file, `${key}=${value}\n`);
}

async function main() {
	const current = readJson(schemaPath);
	console.log(`current schema: Bot API ${current.version.major}.${current.version.minor}.${current.version.patch}`);

	console.log("fetching https://core.telegram.org/bots/api ...");
	const html = await fetchApiHtml();
	const next = parseSchema(html);
	const v = next.version;
	console.log(`live docs: Bot API ${v.major}.${v.minor}.${v.patch} (${next.methods.length} methods, ${next.objects.length} objects)`);

	const isNewer = compareVersions(v, current.version) > 0;
	if (!isNewer && !FORCE) {
		console.log("up to date — nothing to do");
		githubOutput("changed", "false");
		return;
	}

	writeFileSync(schemaPath, JSON.stringify(next));
	console.log("wrote schema.json");

	execFileSync("node", ["scripts/generate.mjs"], { cwd: new URL(".", root).pathname, stdio: "inherit" });
	execFileSync("node", ["scripts/generate.mjs"], {
		cwd: new URL("../contexts/", root).pathname,
		stdio: "inherit",
	});

	const typesPkg = readJson(typesPkgPath);
	const newVersion = `${v.major}.${v.minor}.${v.patch}`;
	typesPkg.version = newVersion;
	writeFileSync(typesPkgPath, `${JSON.stringify(typesPkg, null, "\t")}\n`);
	console.log(`bumped @yaebal/types -> ${newVersion}`);

	const contextsPkg = readJson(contextsPkgPath);
	const contextsVersion = bumpPatch(contextsPkg.version);
	contextsPkg.version = contextsVersion;
	writeFileSync(contextsPkgPath, `${JSON.stringify(contextsPkg, null, "\t")}\n`);
	console.log(`bumped @yaebal/contexts -> ${contextsVersion}`);

	githubOutput("changed", "true");
	githubOutput("version", newVersion);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
