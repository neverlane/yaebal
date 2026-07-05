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

test("parseArgs: help / version", () => {
	assert.equal(parseArgs(["--help"]).help, true);
	assert.equal(parseArgs(["-v"]).version, true);
});
