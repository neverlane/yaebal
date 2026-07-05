import assert from "node:assert/strict";
import test from "node:test";
import { PLUGIN_IDS } from "./catalog.js";
import {
	defaultPackageManager,
	installCommand,
	nodePackageManager,
	renderFiles,
	runCommand,
	scriptCommand,
} from "./scaffold.js";

test("renderFiles: bare project has core only", () => {
	const f = renderFiles({ name: "bot", runtime: "node", plugins: [] });
	const pkg = JSON.parse(f["package.json"] ?? "{}");

	assert.equal(pkg.name, "bot");
	assert.deepEqual(Object.keys(pkg.dependencies), ["@yaebal/core"]);
	assert.match(f["src/index.ts"] ?? "", /new Bot\(token\)/);
	assert.doesNotMatch(f["src/index.ts"] ?? "", /\.install\(/);
});

test("renderFiles: install/setup plugins are wired, dep plugins commented", () => {
	const f = renderFiles({
		name: "bot",
		runtime: "node",
		plugins: ["session", "again", "fmt", "bogus"],
	});

	const pkg = JSON.parse(f["package.json"] ?? "{}");

	assert.ok(pkg.dependencies["@yaebal/session"]);
	assert.ok(pkg.dependencies["@yaebal/again"]);
	assert.ok(pkg.dependencies["@yaebal/fmt"]);
	assert.equal(pkg.dependencies.bogus, undefined); // unknown plugin ignored

	const src = f["src/index.ts"] ?? "";

	assert.match(src, /import \{ session \} from "@yaebal\/session";/);
	assert.match(src, /\.install\(session\(/);
	assert.match(src, /autoRetry\(bot\.api\);/); // `again` is a setup-style plugin
	assert.match(src, /\/\/ import \{ html, md \} from "@yaebal\/fmt";/); // fmt is dep-only
});

test("renderFiles: every catalog plugin generates valid, importable code", () => {
	const f = renderFiles({ name: "bot", runtime: "node", plugins: [...PLUGIN_IDS] });
	const src = f["src/index.ts"] ?? "";
	const pkg = JSON.parse(f["package.json"] ?? "{}");

	// all plugin deps present
	for (const id of PLUGIN_IDS) {
		assert.ok(Object.values(pkg.dependencies).length > 0);
		assert.ok(src.includes(id) || JSON.stringify(pkg.dependencies).includes(id), `missing ${id}`);
	}

	// no duplicate import lines for @yaebal/core
	assert.equal((src.match(/from "@yaebal\/core"/g) ?? []).length, 1);
});

test("renderFiles: template changes the bot body", () => {
	const cmd =
		renderFiles({ name: "b", runtime: "node", plugins: [], template: "commands" })[
			"src/index.ts"
		] ?? "";

	assert.match(cmd, /bot\.command\("ping"/);

	const echo =
		renderFiles({ name: "b", runtime: "node", plugins: [], template: "echo" })["src/index.ts"] ??
		"";

	assert.match(echo, /message:photo/);
});

test("renderFiles: rich templates pull in plugins, imports and wiring", () => {
	const buttons = renderFiles({ name: "b", runtime: "node", plugins: [], template: "buttons" });
	const bsrc = buttons["src/index.ts"] ?? "";
	const bpkg = JSON.parse(buttons["package.json"] ?? "{}");
	assert.ok(bpkg.dependencies["@yaebal/keyboard"]);
	assert.ok(bpkg.dependencies["@yaebal/callback-data"]);
	assert.match(bsrc, /import \{ InlineKeyboard \} from "@yaebal\/keyboard";/);
	assert.match(bsrc, /bot\.callbackQuery\(vote\.pattern/);

	// webhook & runner replace the default bootstrap
	const wh =
		renderFiles({ name: "b", runtime: "bun", plugins: [], template: "webhook" })["src/index.ts"] ??
		"";
	assert.match(wh, /serve\(bot, \{ port \}\)/);
	assert.doesNotMatch(wh, /bot\.start\(\)/);

	const rn =
		renderFiles({ name: "b", runtime: "node", plugins: [], template: "runner" })["src/index.ts"] ??
		"";
	assert.match(rn, /run\(bot, \{ concurrency: 50 \}\)/);
	assert.doesNotMatch(rn, /bot\.start\(\)/);

	// install-style templates add to the chain via a pre-defined const
	const conv =
		renderFiles({ name: "b", runtime: "node", plugins: [], template: "conversation" })[
			"src/index.ts"
		] ?? "";
	assert.match(conv, /const greet = createConversation\(/);
	assert.match(conv, /\.install\(conversation\(\[greet\]\)\)/);
});

test("renderFiles: rich-message template wires ctx.sendRichMessage/richMessageDraft", () => {
	const f = renderFiles({ name: "b", runtime: "node", plugins: [], template: "rich-message" });
	const pkg = JSON.parse(f["package.json"] ?? "{}");
	const src = f["src/index.ts"] ?? "";

	assert.ok(pkg.dependencies["@yaebal/rich"]);
	assert.match(
		src,
		/import \{ rich, document, heading, paragraph, bold, thinking \} from "@yaebal\/rich";/,
	);
	assert.match(src, /\.install\(rich\(\)\)/);
	assert.match(src, /ctx\.sendRichMessage\(/);
	assert.match(src, /ctx\.richMessageDraft\(1\)/);
	assert.match(src, /draft\.send\(/);
});

test("renderFiles: broadcast template wires typed broadcast jobs", () => {
	const f = renderFiles({ name: "b", runtime: "node", plugins: [], template: "broadcast" });
	const pkg = JSON.parse(f["package.json"] ?? "{}");
	const src = f["src/index.ts"] ?? "";

	assert.ok(pkg.dependencies["@yaebal/broadcast"]);
	assert.match(src, /import \{ Broadcast \} from "@yaebal\/broadcast";/);
	assert.match(src, /new Broadcast\(bot\.api/);
	assert.match(src, /\.type\("digest"/);
	assert.match(src, /broadcaster\.start\(/);
	assert.match(src, /"digest"/);
});

test("renderFiles: plugin template emits a package authoring scaffold", () => {
	const f = renderFiles({
		name: "my-plugin",
		runtime: "node",
		packageManager: "pnpm",
		plugins: ["session", "again"],
		template: "plugin",
	});
	const pkg = JSON.parse(f["package.json"] ?? "{}");
	const src = f["src/index.ts"] ?? "";
	const testSrc = f["src/index.test.ts"] ?? "";
	const readme = f["README.md"] ?? "";

	assert.equal(pkg.private, undefined);
	assert.equal(pkg.dependencies, undefined);
	assert.ok(pkg.peerDependencies["@yaebal/core"]);
	assert.ok(pkg.devDependencies["@yaebal/core"]);
	assert.equal(pkg.scripts.example, "tsc -p tsconfig.json && node examples/basic.mjs");
	assert.ok(f["examples/basic.mjs"]);
	assert.match(src, /export function myPlugin/);
	assert.match(src, /ctx\.myPlugin/);
	assert.match(testSrc, /ctx\.myPlugin\.format/);
	assert.match(readme, /src\/index\.ts/);
});

test("renderFiles: a template plugin is never wired twice", () => {
	// user explicitly picks session AND the session-counter template
	const f = renderFiles({
		name: "b",
		runtime: "node",
		plugins: ["session"],
		template: "session-counter",
	});
	const src = f["src/index.ts"] ?? "";
	assert.equal((src.match(/\.install\(session\(/g) ?? []).length, 1);
	assert.equal((src.match(/from "@yaebal\/session"/g) ?? []).length, 1);
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

test("commands map to package managers", () => {
	assert.equal(installCommand("pnpm"), "pnpm install");
	assert.equal(installCommand("deno"), "deno cache src/index.ts");
	assert.equal(runCommand("npm", "dev"), "npm run dev");
	assert.equal(scriptCommand("bun", "test"), "bun run test");
	assert.equal(scriptCommand("deno", "test"), "pnpm test");
	assert.equal(nodePackageManager("deno"), "pnpm");
	assert.equal(defaultPackageManager("bun"), "bun");
	assert.equal(defaultPackageManager("node"), "pnpm");
});
