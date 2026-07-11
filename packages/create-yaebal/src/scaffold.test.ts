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
	const cmdFiles = renderFiles({ name: "b", runtime: "node", plugins: [], template: "commands" });
	const cmd = cmdFiles["src/index.ts"] ?? "";

	assert.match(cmd, /\.add\("ping"/);
	assert.match(cmd, /\.install\(cmd\.plugin\(\)\)/);
	assert.match(cmd, /cmd\.sync\(bot\.api\)/);
	assert.ok(JSON.parse(cmdFiles["package.json"] ?? "{}").dependencies["@yaebal/commands"]);

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
	assert.match(bsrc, /import \{ callbackData, field \} from "@yaebal\/callback-data";/);
	assert.match(bsrc, /bot\.callbackQuery\(vote,/);
	assert.match(bsrc, /ctx\.queryData\.choice/);

	// webhook & runner replace the default bootstrap
	const wh =
		renderFiles({ name: "b", runtime: "bun", plugins: [], template: "webhook" })["src/index.ts"] ??
		"";
	assert.match(wh, /await serve\(bot, \{ port, secretToken \}\)/);
	assert.match(wh, /server\.stop\(\)/);
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

test("renderFiles: toml template ships bot.toml and wires installToml", () => {
	const f = renderFiles({ name: "b", runtime: "node", plugins: [], template: "toml" });
	const pkg = JSON.parse(f["package.json"] ?? "{}");
	const src = f["src/index.ts"] ?? "";
	const toml = f["bot.toml"] ?? "";

	assert.ok(pkg.dependencies["@yaebal/toml"]);
	assert.match(src, /import \{ installToml \} from "@yaebal\/toml";/);
	assert.match(src, /installToml\(bot, "\.\/bot\.toml"/);
	assert.match(src, /syncCommands: true/);
	assert.match(toml, /\[\[commands\]\]/);
	assert.match(toml, /handler = "ping"/);
	assert.match(toml, /regex = /);
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

test("renderFiles: bot templates pin a current toolchain, and gitignore has no stray build dir", () => {
	const f = renderFiles({ name: "b", runtime: "node", plugins: [] });
	const pkg = JSON.parse(f["package.json"] ?? "{}");

	assert.equal(pkg.devDependencies.typescript, "^6.0.3");
	assert.equal(pkg.devDependencies["@types/node"], "latest");
	assert.doesNotMatch(f[".gitignore"] ?? "", /^lib$/m); // bot templates never emit to lib/ (noEmit: true)
});

test("renderFiles: plugin peerDependencies is a real range, not >=0.0.0", () => {
	const f = renderFiles({ name: "my-plugin", runtime: "node", plugins: [], template: "plugin" });
	const pkg = JSON.parse(f["package.json"] ?? "{}");

	assert.equal(pkg.peerDependencies["@yaebal/core"], ">=0.3.0");
	assert.equal(pkg.devDependencies.typescript, "^6.0.3");
});

test("renderFiles: plugin identifiers never collide with the codegen's own bindings", () => {
	for (const name of ["bot", "test", "assert", "token", "process"]) {
		const f = renderFiles({ name, runtime: "node", plugins: [], template: "plugin" });
		const src = f["src/index.ts"] ?? "";
		const example = f["examples/basic.mjs"] ?? "";

		// the derived export name must never equal the reserved binding itself
		assert.doesNotMatch(src, new RegExp(`export function ${name}\\(`));
		assert.doesNotMatch(example, new RegExp(`import \\{ ${name} \\} from`));
	}
});

test("renderFiles: scoped plugin names (@org/name) render cleanly", () => {
	const f = renderFiles({
		name: "@acme/my-plugin",
		runtime: "node",
		plugins: [],
		template: "plugin",
	});
	const pkg = JSON.parse(f["package.json"] ?? "{}");

	assert.equal(pkg.name, "@acme/my-plugin");
	assert.match(f["src/index.ts"] ?? "", /export function myPlugin/);
});

test("renderFiles: analytics/feature-flags carry a real, importable adapter showcase", () => {
	const src = renderFiles({
		name: "b",
		runtime: "node",
		plugins: ["analytics", "feature-flags"],
	})["src/index.ts"] as string;

	assert.match(src, /postHogAdapter/);
	assert.match(src, /launchDarklyAdapter/);
	// it's a comment, not live code — must not add a real (uncommented) import
	assert.doesNotMatch(src, /^import \{ postHogAdapter/m);
});

test("renderFiles: deploy targets add the right infra files", () => {
	const docker = renderFiles({ name: "b", runtime: "node", plugins: [], deploy: "docker" });
	assert.ok(docker.Dockerfile);
	assert.ok(docker[".dockerignore"]);
	assert.equal(docker["compose.yaml"], undefined);

	const compose = renderFiles({ name: "b", runtime: "bun", plugins: [], deploy: "compose" });
	assert.match(compose.Dockerfile ?? "", /oven\/bun/);
	assert.ok(compose["compose.yaml"]);

	const fly = renderFiles({ name: "b", runtime: "node", plugins: [], deploy: "fly" });
	assert.match(fly["fly.toml"] ?? "", /app = "b"/);

	const railway = renderFiles({ name: "b", runtime: "node", plugins: [], deploy: "railway" });
	assert.match(railway["railway.json"] ?? "", /DOCKERFILE/);
});

test("renderFiles: cloudflare deploy owns the bootstrap and adds SECRET_TOKEN", () => {
	const f = renderFiles({ name: "b", runtime: "node", plugins: [], deploy: "cloudflare" });
	const src = f["src/index.ts"] ?? "";
	const pkg = JSON.parse(f["package.json"] ?? "{}");

	assert.match(src, /import \{ cloudflareAdapter \} from "@yaebal\/web";/);
	assert.match(src, /export default \{/);
	assert.match(src, /cloudflareAdapter\(bot, \{ secretToken: process\.env\.SECRET_TOKEN \}\)/);
	assert.doesNotMatch(src, /bot\.start\(\)/);
	assert.ok(pkg.dependencies["@yaebal/web"]);
	assert.match(f[".env.example"] ?? "", /SECRET_TOKEN=/);
	assert.ok(f["wrangler.jsonc"]);
	assert.ok(f[".dev.vars.example"]);
});

test("renderFiles: cloudflare deploy overrides even a bootstrap-owning template", () => {
	// webhook's own serve()-based bootstrap would conflict with cloudflare's
	// export-default-fetch shape — the deploy target must win.
	const src = renderFiles({
		name: "b",
		runtime: "node",
		plugins: [],
		template: "webhook",
		deploy: "cloudflare",
	})["src/index.ts"] as string;

	assert.match(src, /cloudflareAdapter\(bot,/);
	assert.doesNotMatch(src, /await serve\(bot,/);
});

test("renderFiles: vercel deploy adds a separate api/bot.ts edge entry, leaving src/index.ts as-is", () => {
	const f = renderFiles({ name: "b", runtime: "node", plugins: [], deploy: "vercel" });

	assert.match(f["src/index.ts"] ?? "", /await bot\.start\(\)/); // unaffected — still a normal polling bot
	assert.ok(f["vercel.json"]);
	assert.match(f["api/bot.ts"] ?? "", /import \{ webhook \} from "@yaebal\/web";/);
	assert.match(f["api/bot.ts"] ?? "", /export const config = \{ runtime: "edge" \};/);
	assert.match(f["api/bot.ts"] ?? "", /export default webhook\(bot, \{ secretToken/);

	const tsconfig = JSON.parse(f["tsconfig.json"] ?? "{}");
	assert.deepEqual(tsconfig.include, ["src", "api"]);
});

test("renderFiles: ci flag adds a github actions workflow for both bot and plugin templates", () => {
	const bot = renderFiles({ name: "b", runtime: "node", plugins: [], ci: true });
	assert.match(bot[".github/workflows/ci.yml"] ?? "", /run: pnpm typecheck/);

	const plugin = renderFiles({
		name: "my-plugin",
		runtime: "node",
		packageManager: "pnpm",
		plugins: [],
		template: "plugin",
		ci: true,
	});
	assert.match(plugin[".github/workflows/ci.yml"] ?? "", /run: pnpm test/);

	const noCi = renderFiles({ name: "b", runtime: "node", plugins: [] });
	assert.equal(noCi[".github/workflows/ci.yml"], undefined);
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
