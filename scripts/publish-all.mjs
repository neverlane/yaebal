// publish every public workspace package whose current version is not yet on npm.
//
// uses `pnpm publish` (not `npm publish`) so each `workspace:*` dependency is rewritten
// to its real published version on the way out — that's the whole reason a monorepo can
// publish at all. a package whose version already exists on the registry is skipped, so
// running this on every push to the default branch is a no-op until a version is bumped.
//
// one failing package doesn't stop the rest: every pending package is attempted, the failures
// are listed at the end, and the script exits non-zero if there were any. (it used to stop at
// the first error, so one package missing its trusted-publisher config on npmjs.com silently
// held back every package sorted after it.)
//
// packages go out in dependency order, and a package is held back when one of its workspace
// dependencies isn't on npm at the version it would pin: `pnpm publish` rewrites `workspace:*`
// to that exact version, so publishing anyway ships a package nobody can install. (that's how
// @yaebal/core@0.4.4 ended up on npm pinning a @yaebal/types@10.3.2 that never got published.)
//
// set DRY_RUN=1 to print the plan without publishing. in CI it also passes --provenance
// (set NO_PROVENANCE=1 to opt out, e.g. if a package's `repository` field doesn't match).
// CI authenticates through npm trusted publishing (oidc) — `pnpm publish` hands the packed
// tarball to the npm cli, which does the token exchange; see .github/workflows/release.yml.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PKGS_DIR = "packages";
const DRY_RUN = process.env.DRY_RUN === "1";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

// every non-private package under packages/* (name + version come from its manifest, so
// the directory name is irrelevant — `yaebal` and `create-yaebal` are picked up too).
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

		// workspace deps that end up in the published manifest (devDependencies don't install)
		const deps = new Set();
		for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
			for (const [dep, range] of Object.entries(manifest[field] ?? {})) {
				if (String(range).startsWith("workspace:")) deps.add(dep);
			}
		}

		out.push({ dir: join(PKGS_DIR, entry), name: manifest.name, version: manifest.version, deps });
	}

	return topoSort(out.sort((a, b) => a.name.localeCompare(b.name)));
}

// dependencies before dependents (alphabetical among peers, so the order stays stable)
function topoSort(pkgs) {
	const byName = new Map(pkgs.map((p) => [p.name, p]));
	const done = new Set();
	const visiting = new Set();
	const out = [];

	const visit = (pkg) => {
		if (done.has(pkg.name)) return;
		if (visiting.has(pkg.name)) throw new Error(`workspace dependency cycle through ${pkg.name}`);
		visiting.add(pkg.name);
		for (const dep of pkg.deps) {
			const target = byName.get(dep);
			if (target) visit(target);
		}
		visiting.delete(pkg.name);
		done.add(pkg.name);
		out.push(pkg);
	};

	for (const pkg of pkgs) visit(pkg);
	return out;
}

// is <name>@<version> already on the registry? a non-zero `npm view` (404 for a brand-new
// package or an unpublished version) is treated as "not published".
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

function publish(pkg) {
	const args = ["--filter", pkg.name, "publish", "--access", "public", "--no-git-checks"];

	if (process.env.CI && process.env.NO_PROVENANCE !== "1") {
		args.push("--provenance");
	}

	execFileSync("pnpm", args, { stdio: "inherit" });
}

const published = [];
const skipped = [];
const failed = [];
const blocked = [];

const pkgs = workspacePackages();
const versionOf = new Map(pkgs.map((p) => [p.name, p.version]));
// name -> is its current version installable from npm (already there, or published this run)
const available = new Map();

for (const pkg of pkgs) {
	const id = `${pkg.name}@${pkg.version}`;

	if (isPublished(pkg.name, pkg.version)) {
		skipped.push(id);
		available.set(pkg.name, true);

		continue;
	}

	const missing = [...pkg.deps].filter((dep) => versionOf.has(dep) && !available.get(dep));
	if (missing.length > 0) {
		blocked.push(
			`${id} (needs ${missing.map((dep) => `${dep}@${versionOf.get(dep)}`).join(", ")})`,
		);
		available.set(pkg.name, false);

		continue;
	}

	if (DRY_RUN) {
		console.log(`would publish ${id}`);
		published.push(id);
		available.set(pkg.name, true);

		continue;
	}

	console.log(`publishing ${id}`);

	try {
		publish(pkg);
		published.push(id);
		available.set(pkg.name, true);
	} catch {
		// pnpm/npm already printed the reason above (stdio is inherited)
		failed.push(id);
		available.set(pkg.name, false);
	}
}

console.log(
	`\n${DRY_RUN ? "[dry-run] " : ""}published ${published.length}, skipped ${skipped.length} (already on npm)`,
);

if (published.length > 0) {
	console.log(published.map((id) => `  + ${id}`).join("\n"));
}

if (blocked.length > 0) {
	console.error(
		`\nheld back ${blocked.length} (a workspace dependency isn't on npm, publishing would ship an uninstallable package):\n${blocked.map((id) => `  ⏸ ${id}`).join("\n")}`,
	);
}

if (failed.length > 0) {
	console.error(`\nfailed ${failed.length}:\n${failed.map((id) => `  ✗ ${id}`).join("\n")}`);
	console.error(
		"\nan E404 on PUT under trusted publishing means npmjs.com has no trusted publisher for that\n" +
			"package (settings → trusted publisher → github actions: neverlane/yaebal, release.yml),\n" +
			"or the package doesn't exist yet — oidc can't create packages, publish the first version by hand.",
	);
}

if (failed.length > 0 || blocked.length > 0) process.exit(1);
