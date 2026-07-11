import assert from "node:assert/strict";
import test from "node:test";
import { parseArgs } from "./args.js";
import { PLUGIN_IDS } from "./catalog.js";

test("parseArgs: positional name + short flags", () => {
	const a = parseArgs(["my-bot", "-r", "bun", "-t", "commands", "-p", "session,again"]);

	assert.equal(a.name, "my-bot");
	assert.equal(a.runtime, "bun");
	assert.equal(a.template, "commands");
	assert.deepEqual(a.plugins, ["session", "again"]);
});

test("parseArgs: plugin template", () => {
	const a = parseArgs(["my-plugin", "-t", "plugin"]);

	assert.equal(a.name, "my-plugin");
	assert.equal(a.template, "plugin");
});

test("parseArgs: --flag=value form and pm alias", () => {
	const a = parseArgs(["bot", "--runtime=deno", "--pm=npm"]);

	assert.equal(a.runtime, "deno");
	assert.equal(a.packageManager, "npm");
});

test("parseArgs: plugins all / none", () => {
	assert.deepEqual(parseArgs(["b", "-p", "all"]).plugins, [...PLUGIN_IDS]);
	assert.deepEqual(parseArgs(["b", "-p", "none"]).plugins, []);

	assert.equal(parseArgs(["b"]).plugins, undefined); // not provided
});

test("parseArgs: boolean toggles and yes", () => {
	const a = parseArgs(["b", "--no-install", "--git", "--no-tui", "-y"]);

	assert.equal(a.install, false);
	assert.equal(a.git, true);
	assert.equal(a.tui, false);
	assert.equal(a.yes, true);
});

test("parseArgs: invalid enum values are ignored, unknown flags collected", () => {
	const a = parseArgs(["b", "-r", "rust", "--frobnicate"]);

	assert.equal(a.runtime, undefined);
	assert.ok(a.unknown.includes("--frobnicate"));
});

test("parseArgs: invalid enum value on a known flag warns instead of failing silently", () => {
	const a = parseArgs(["b", "--runtime", "rust"]);

	assert.equal(a.runtime, undefined);
	assert.ok(a.warnings.some((w) => w.includes("--runtime") && w.includes("rust")));
});

test("parseArgs: a value-flag with no value does NOT swallow the next flag", () => {
	// this used to eat "--yes" entirely: out.yes stayed false, no warning, no trace.
	const a = parseArgs(["my-bot", "--runtime", "--yes"]);

	assert.equal(a.yes, true);
	assert.equal(a.runtime, undefined);
	assert.ok(a.warnings.some((w) => w.includes("--runtime")));
});

test("parseArgs: a value-flag at the very end of argv doesn't crash or consume", () => {
	const a = parseArgs(["my-bot", "--template"]);

	assert.equal(a.template, undefined);
	assert.ok(a.warnings.some((w) => w.includes("--template")));
});

test("parseArgs: --plugins with no value doesn't swallow the following flag", () => {
	const a = parseArgs(["b", "--plugins", "--yes"]);

	assert.equal(a.plugins, undefined);
	assert.equal(a.yes, true);
	assert.ok(a.warnings.some((w) => w.includes("--plugins")));
});

test("parseArgs: deploy, ci, config and json flags", () => {
	const a = parseArgs(["b", "-d", "cloudflare", "--ci", "-c", "my.json", "--yes", "--json"]);

	assert.equal(a.deploy, "cloudflare");
	assert.equal(a.ci, true);
	assert.equal(a.configPath, "my.json");
	assert.equal(a.json, true);

	const disabled = parseArgs(["b", "--no-config", "--no-ci"]);
	assert.equal(disabled.noConfig, true);
	assert.equal(disabled.ci, false);
});

test("parseArgs: invalid deploy target warns", () => {
	const a = parseArgs(["b", "--deploy", "heroku"]);

	assert.equal(a.deploy, undefined);
	assert.ok(a.warnings.some((w) => w.includes("--deploy") && w.includes("heroku")));
});

test("parseArgs: help / version", () => {
	assert.equal(parseArgs(["--help"]).help, true);
	assert.equal(parseArgs(["-v"]).version, true);
});
