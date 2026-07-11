import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseArgs } from "./args.js";
import { applyConfigFile, loadConfigFile } from "./config-file.js";

function withTmpDir(fn: (dir: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "create-yaebal-config-"));
	try {
		fn(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test("loadConfigFile: no config anywhere returns empty values", () => {
	withTmpDir((dir) => {
		const result = loadConfigFile(dir, undefined, false);
		assert.deepEqual(result.values, {});
		assert.deepEqual(result.warnings, []);
	});
});

test("loadConfigFile: autodetects create-yaebal.json in cwd", () => {
	withTmpDir((dir) => {
		writeFileSync(
			join(dir, "create-yaebal.json"),
			JSON.stringify({ runtime: "bun", template: "commands", plugins: ["session"] }),
		);

		const result = loadConfigFile(dir, undefined, false);
		assert.equal(result.values.runtime, "bun");
		assert.equal(result.values.template, "commands");
		assert.deepEqual(result.values.plugins, ["session"]);
		assert.equal(result.source, "create-yaebal.json");
	});
});

test('loadConfigFile: falls back to a "create-yaebal" key in package.json', () => {
	withTmpDir((dir) => {
		writeFileSync(
			join(dir, "package.json"),
			JSON.stringify({ name: "x", "create-yaebal": { runtime: "deno" } }),
		);

		const result = loadConfigFile(dir, undefined, false);
		assert.equal(result.values.runtime, "deno");
	});
});

test("loadConfigFile: --no-config skips autodetection", () => {
	withTmpDir((dir) => {
		writeFileSync(join(dir, "create-yaebal.json"), JSON.stringify({ runtime: "bun" }));

		const result = loadConfigFile(dir, undefined, true);
		assert.deepEqual(result.values, {});
	});
});

test("loadConfigFile: an explicit --config path wins even when disabled would apply", () => {
	withTmpDir((dir) => {
		writeFileSync(join(dir, "custom.json"), JSON.stringify({ runtime: "bun" }));

		const result = loadConfigFile(dir, "custom.json", true);
		assert.equal(result.values.runtime, "bun");
	});
});

test("loadConfigFile: a missing explicit --config path warns", () => {
	withTmpDir((dir) => {
		const result = loadConfigFile(dir, "missing.json", false);
		assert.deepEqual(result.values, {});
		assert.ok(result.warnings.some((w) => w.includes("not found")));
	});
});

test("loadConfigFile: invalid enum values warn and are dropped", () => {
	withTmpDir((dir) => {
		writeFileSync(join(dir, "create-yaebal.json"), JSON.stringify({ runtime: "rust" }));

		const result = loadConfigFile(dir, undefined, false);
		assert.equal(result.values.runtime, undefined);
		assert.ok(result.warnings.some((w) => w.includes("runtime")));
	});
});

test("loadConfigFile: invalid json warns instead of throwing", () => {
	withTmpDir((dir) => {
		writeFileSync(join(dir, "create-yaebal.json"), "{ not json");

		const result = loadConfigFile(dir, undefined, false);
		assert.deepEqual(result.values, {});
		assert.ok(result.warnings.some((w) => w.includes("invalid json")));
	});
});

test("applyConfigFile: cli flags always win over the config file", () => {
	const args = parseArgs(["my-bot", "--runtime", "bun"]);
	const merged = applyConfigFile(args, { runtime: "deno", template: "commands" });

	assert.equal(merged.runtime, "bun"); // flag wins
	assert.equal(merged.template, "commands"); // config fills the gap
});
