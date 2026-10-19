import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import process from "node:process";
import test from "node:test";
import { exec, projectDirName, validateProjectName } from "./util.js";

test("validateProjectName: plain names", () => {
	assert.equal(validateProjectName("my-bot"), undefined);
	assert.equal(validateProjectName(""), "project name is required");
	assert.equal(validateProjectName("."), "pick a real directory name");
	assert.equal(validateProjectName(".."), "pick a real directory name");
	assert.match(validateProjectName("My-Bot") ?? "", /lowercase/);
	assert.match(validateProjectName(".hidden") ?? "", /can't start with/);
	assert.match(validateProjectName("a".repeat(215)) ?? "", /too long/);
});

test("validateProjectName: scoped names (@org/name) are accepted", () => {
	assert.equal(validateProjectName("@org/my-plugin"), undefined);
	assert.equal(validateProjectName("@my-org.io/my-plugin"), undefined);

	assert.match(validateProjectName("@org") ?? "", /needs a '\//);
	assert.match(validateProjectName("@/my-plugin") ?? "", /scope can't be empty/);
	assert.match(validateProjectName("@org/") ?? "", /name can't be empty/);
	assert.match(validateProjectName("@org/sub/name") ?? "", /only one '\/'/);
	assert.match(validateProjectName("@Org/my-plugin") ?? "", /lowercase/);
});

test("projectDirName: strips the scope for the folder name", () => {
	assert.equal(projectDirName("my-bot"), "my-bot");
	assert.equal(projectDirName("@org/my-plugin"), "my-plugin");
	assert.equal(projectDirName("  @org/my-plugin  "), "my-plugin");
});

test("exec: a child killed by a signal is a failure, not exit code 0 (regression)", {
	timeout: 10_000,
	skip: process.platform === "win32",
}, async () => {
	assert.notEqual(await exec("sh", ["-c", "kill -9 $$"], tmpdir()), 0);
	assert.equal(await exec("sh", ["-c", "exit 0"], tmpdir()), 0);
});

test("exec(stdoutToStderr): child stdout never reaches our stdout (regression: --json)", {
	timeout: 10_000,
	skip: process.platform === "win32",
}, () => {
	const util = new URL("./util.js", import.meta.url).href;
	const script = `const { exec } = await import(${JSON.stringify(util)});
process.exitCode = await exec("sh", ["-c", "echo child-output"], ".", true);`;
	const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
		encoding: "utf8",
		timeout: 8_000,
	});

	assert.equal(r.status, 0, r.stderr);
	assert.equal(r.stdout, "");
	assert.match(r.stderr, /child-output/);
});
