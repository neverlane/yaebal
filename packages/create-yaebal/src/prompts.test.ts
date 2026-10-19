import assert from "node:assert/strict";
import test from "node:test";
import { parseArgs } from "./args.js";
import { runPrompts } from "./prompts.js";

test("runPrompts: --ci is honored for the plugin template (regression: forced to false)", {
	timeout: 5000,
}, async () => {
	// every question pinned by a flag, so the plain wizard asks nothing and never reads stdin
	const args = parseArgs([
		"my-plugin",
		"-t",
		"plugin",
		"-m",
		"pnpm",
		"--ai",
		"none",
		"--ci",
		"--no-git",
		"--no-install",
	]);

	const selections = await runPrompts(args);
	assert.equal(selections?.template, "plugin");
	assert.equal(selections?.ci, true);
});
