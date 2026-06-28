import assert from "node:assert/strict";
import test from "node:test";
import { renderFiles } from "./index.js";

test("renderFiles: bare project has core only", () => {
	const f = renderFiles({ name: "bot", runtime: "node", plugins: [] });
	const pkg = JSON.parse(f["package.json"] ?? "{}");

	assert.equal(pkg.name, "bot");
	assert.deepEqual(Object.keys(pkg.dependencies), ["@yaebal/core"]);
	assert.match(f["src/index.ts"] ?? "", /new Bot\(process\.env\.BOT_TOKEN/);
	assert.doesNotMatch(f["src/index.ts"] ?? "", /\.install\(/);
});

test("renderFiles: chosen plugins add deps, imports and wiring", () => {
	const f = renderFiles({ name: "bot", runtime: "node", plugins: ["session", "again", "bogus"] });
	const pkg = JSON.parse(f["package.json"] ?? "{}");

	assert.ok(pkg.dependencies["@yaebal/session"]);
	assert.ok(pkg.dependencies["@yaebal/again"]);
	assert.equal(pkg.dependencies.bogus, undefined); // unknown plugin ignored

	const src = f["src/index.ts"] ?? "";
	assert.match(src, /import \{ session \} from "@yaebal\/session";/);
	assert.match(src, /\.install\(session\(/);
	assert.match(src, /autoRetry\(bot\.api\);/); // `again` is a setup-style plugin
});

test("renderFiles: runtime picks the right scripts", () => {
	const bun = JSON.parse(
		renderFiles({ name: "b", runtime: "bun", plugins: [] })["package.json"] ?? "{}",
	);
	assert.match(bun.scripts.start, /^bun /);

	const deno = JSON.parse(
		renderFiles({ name: "d", runtime: "deno", plugins: [] })["package.json"] ?? "{}",
	);
	assert.match(deno.scripts.start, /^deno run /);
});
