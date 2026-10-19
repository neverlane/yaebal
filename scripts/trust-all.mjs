// register this repo's release workflow as the npm trusted publisher of every public package.
//
// release.yml publishes through npm trusted publishing (oidc), which only works for packages
// that list `neverlane/yaebal` + `release.yml` as a trusted publisher on npmjs.com — a package
// without it fails with E404 on PUT. this walks every public workspace package, skips the ones
// already trusting the workflow, and adds the relationship to the rest. needs `npm login` as a
// package owner (npm >= 11.10 for `npm trust`). set DRY_RUN=1 to print the plan only.
//
// oidc can't create a package: a brand-new package still needs its first version published by
// hand (`pnpm --filter <name> publish --access public`) before it can be trusted.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PKGS_DIR = "packages";
const REPO = process.env.GITHUB_REPOSITORY ?? "neverlane/yaebal";
const WORKFLOW = "release.yml";
const DRY_RUN = process.env.DRY_RUN === "1";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

function publicPackages() {
	const out = [];

	for (const entry of readdirSync(PKGS_DIR)) {
		const manifestPath = join(PKGS_DIR, entry, "package.json");
		if (!existsSync(manifestPath)) continue;

		const manifest = readJson(manifestPath);
		if (manifest.private || !manifest.name) continue;

		out.push(manifest.name);
	}

	return out.sort();
}

// npm prints the actual reason on the last line of stderr
const lastLine = (error) => String(error.stderr ?? error.message).trim().split("\n").at(-1);

function npm(args) {
	return execFileSync("npm", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

const trusted = [];
const added = [];
const failed = [];

for (const name of publicPackages()) {
	let listing = "";
	try {
		listing = npm(["trust", "list", name, "--json"]);
	} catch (error) {
		failed.push(`${name}: ${lastLine(error)}`);
		continue;
	}

	if (listing.includes(REPO) && listing.includes(WORKFLOW)) {
		trusted.push(name);
		continue;
	}

	if (DRY_RUN) {
		console.log(`would trust ${REPO}/${WORKFLOW} for ${name}`);
		added.push(name);
		continue;
	}

	try {
		npm(["trust", "github", name, "--repo", REPO, "--file", WORKFLOW, "--allow-publish", "--yes"]);
		console.log(`trusted ${REPO}/${WORKFLOW} for ${name}`);
		added.push(name);
	} catch (error) {
		failed.push(`${name}: ${lastLine(error)}`);
	}
}

console.log(
	`\n${DRY_RUN ? "[dry-run] " : ""}added ${added.length}, already trusted ${trusted.length}, failed ${failed.length}`,
);

if (failed.length > 0) {
	console.error(failed.map((line) => `  ✗ ${line}`).join("\n"));
	process.exit(1);
}
