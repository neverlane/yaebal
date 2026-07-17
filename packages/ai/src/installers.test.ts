import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
	MARKER_END,
	MARKER_START,
	readSkills,
	rulesDigest,
	upsertSection,
} from "./installers/content.js";
import { AGENT_TARGETS, installAgents } from "./installers/targets.js";

const scratch = () => mkdtempSync(join(tmpdir(), "yaebal-ai-test-"));

test("upsertSection: appends once, replaces on re-run", () => {
	const first = upsertSection(undefined, "rules v1");
	assert.ok(first.includes(MARKER_START) && first.includes("rules v1"));

	const appended = upsertSection("# my project\n\nkeep me.", "rules v1");
	assert.ok(appended.startsWith("# my project"));
	assert.ok(appended.includes("keep me."));

	const replaced = upsertSection(appended, "rules v2");
	assert.ok(replaced.includes("rules v2"));
	assert.ok(!replaced.includes("rules v1"));
	assert.equal(replaced.split(MARKER_START).length, 2); // exactly one managed block
	assert.equal(replaced.split(MARKER_END).length, 2);
});

test("rulesDigest: carries the core invariants", () => {
	const digest = rulesDigest();
	assert.match(digest, /createBot\(\)/);
	assert.match(digest, /bot\.install\(plugin\(\)\)/);
	assert.match(digest, /get_api_method/);
	assert.match(digest, /\.js/);
});

test("installAgents: cursor writes rules + merges mcp.json preserving other servers", () => {
	const cwd = scratch();
	writeFileSync(
		join(cwd, ".cursor.keep"), // ensure dir writes work from a clean root
		"",
	);
	const results = installAgents(cwd, ["cursor"]);
	assert.ok(results.get("cursor")?.some((a) => a.detail.includes("yaebal.mdc")));

	const mdc = readFileSync(join(cwd, ".cursor", "rules", "yaebal.mdc"), "utf8");
	assert.match(mdc, /^---\ndescription: /);
	assert.match(mdc, /alwaysApply: true/);

	// re-running over an existing config keeps foreign entries
	const mcpPath = join(cwd, ".cursor", "mcp.json");
	const config = JSON.parse(readFileSync(mcpPath, "utf8"));
	config.mcpServers.other = { command: "deno" };
	writeFileSync(mcpPath, JSON.stringify(config));
	installAgents(cwd, ["cursor"]);
	const merged = JSON.parse(readFileSync(mcpPath, "utf8"));
	assert.equal(merged.mcpServers.other.command, "deno");
	assert.deepEqual(merged.mcpServers.yaebal.args, ["-y", "@yaebal/ai", "mcp"]);
});

test("installAgents: shared AGENTS.md section stays single across codex+opencode", () => {
	const cwd = scratch();
	installAgents(cwd, ["codex", "opencode", "agents-md"]);
	const agents = readFileSync(join(cwd, "AGENTS.md"), "utf8");
	assert.equal(agents.split(MARKER_START).length, 2);

	const opencode = JSON.parse(readFileSync(join(cwd, "opencode.json"), "utf8"));
	assert.equal(opencode.mcp.yaebal.type, "local");
});

test("installAgents: invalid json config becomes a note, never clobbered", () => {
	const cwd = scratch();
	writeFileSync(join(cwd, "opencode.json"), "{broken");
	const results = installAgents(cwd, ["opencode"]);
	const actions = results.get("opencode") ?? [];
	assert.ok(actions.some((a) => a.kind === "note" && a.detail.includes("manually")));
	assert.equal(readFileSync(join(cwd, "opencode.json"), "utf8"), "{broken");
});

test("installAgents: unknown agent throws with the known list", () => {
	assert.throws(() => installAgents(scratch(), ["vim"]), /known: claude/);
});

test("claude-plugin/ marketplace artifact is in sync with skills sources", () => {
	// repo-only drift guard: skills edited without `pnpm generate` must fail here.
	const packageRoot = fileURLToPath(new URL("..", import.meta.url));
	const pluginSkills = join(packageRoot, "claude-plugin", "skills");
	if (!existsSync(pluginSkills)) return; // published tarball — nothing to compare

	const skills = readSkills();
	assert.ok(skills.length > 0);
	for (const skill of skills) {
		const copy = readFileSync(join(pluginSkills, skill.name, "SKILL.md"), "utf8");
		assert.equal(
			copy,
			skill.raw,
			`claude-plugin skill "${skill.name}" is stale — run pnpm --filter @yaebal/ai generate`,
		);
	}
});

test("agent targets: ids are unique and detect() never throws on empty dirs", () => {
	const cwd = scratch();
	const ids = AGENT_TARGETS.map((t) => t.id);
	assert.equal(new Set(ids).size, ids.length);
	for (const target of AGENT_TARGETS) assert.equal(typeof target.detect(cwd), "boolean");
});
