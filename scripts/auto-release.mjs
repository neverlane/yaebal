// create a github release for every published workspace package that doesn't have one yet.
//
// adapted from puregram's auto-release.mjs. puregram drives releases off release-marker
// commits (`feat(api): @puregram/api@10.1.3`); yaebal has no such convention, so this walks
// the same per-package idea from the manifests instead: tag/title is `<name>@<version>`
// (e.g. `@yaebal/core@0.0.1`), and the body lists the commits that touched that package's
// directory since its previous tag. only versions that actually reached npm are released,
// so this is the natural follow-up to publish-all.mjs. set DRY_RUN=1 to print instead.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = process.env.GITHUB_REPOSITORY ?? "neverlane/yaebal";
const TARGET = process.env.GITHUB_SHA ?? "HEAD";
const PKGS_DIR = "packages";
const DRY_RUN = process.env.DRY_RUN === "1";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

function workspacePackages() {
	const out = [];

	for (const entry of readdirSync(PKGS_DIR)) {
		const manifestPath = join(PKGS_DIR, entry, "package.json");

		if (!existsSync(manifestPath)) {
			continue;
		}

		const manifest = readJson(manifestPath);

		if (manifest.private || !manifest.name || !manifest.version) {
			continue;
		}

		out.push({ dir: join(PKGS_DIR, entry), name: manifest.name, version: manifest.version });
	}

	return out.sort((a, b) => a.name.localeCompare(b.name));
}

// most recent existing tag for this package (`<name>@<x.y.z>`), newest version first, or null
function previousTag(name) {
	let out = "";

	try {
		out = execFileSync("git", ["tag", "--list", `${name}@*`, "--sort=-v:refname"], {
			encoding: "utf8",
		}).trim();
	} catch {
		return null;
	}

	return out ? out.split("\n")[0] : null;
}

function buildBody(pkg, tag) {
	const prev = previousTag(pkg.name);
	const range = prev ? `${prev}..HEAD` : "HEAD";
	const header = `[${tag}](https://www.npmjs.com/package/${pkg.name}/v/${pkg.version})`;

	let log = "";

	try {
		log = execFileSync("git", ["log", "--no-merges", "--format=%h%x09%s", range, "--", pkg.dir], {
			encoding: "utf8",
		}).trim();
	} catch {
		log = "";
	}

	if (!log) {
		return `${header}\n\n_no notable changes_`;
	}

	const bullets = log.split("\n").map((line) => {
		const [short, ...rest] = line.split("\t");

		return `- ${rest.join("\t")} (${short})`;
	});

	return `${header}\n\n${bullets.join("\n")}`;
}

// is <name>@<version> on the registry? we only release what actually published.
function isPublished(name, version) {
	try {
		const out = execFileSync("npm", ["view", `${name}@${version}`, "version"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();

		return out === version;
	} catch {
		return false;
	}
}

function releaseExists(tag) {
	try {
		execFileSync("gh", ["release", "view", tag, "--repo", REPO], { stdio: "ignore" });

		return true;
	} catch {
		return false;
	}
}

for (const pkg of workspacePackages()) {
	const tag = `${pkg.name}@${pkg.version}`;

	if (!DRY_RUN && !isPublished(pkg.name, pkg.version)) {
		continue;
	}

	if (!DRY_RUN && releaseExists(tag)) {
		console.log(`skip ${tag} — release already exists`);

		continue;
	}

	const body = buildBody(pkg, tag);

	if (DRY_RUN) {
		console.log(`\n=== ${tag} ===\n${body}\n`);

		continue;
	}

	console.log(`creating release ${tag}`);
	execFileSync(
		"gh",
		["release", "create", tag, "--repo", REPO, "--target", TARGET, "--title", tag, "--notes", body],
		{
			stdio: ["ignore", "inherit", "inherit"],
		},
	);
}
