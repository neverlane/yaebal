import assert from "node:assert/strict";
import test from "node:test";
import { projectDirName, validateProjectName } from "./util.js";

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
