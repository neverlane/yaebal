/**
 * project generation. `renderFiles` is pure — options in, a `path → contents`
 * map out — so it is trivially testable. `writeProject` is the thin fs wrapper
 * that flushes that map to disk.
 *
 * a template is more than a bot body: it can pull in plugins, add real imports,
 * declare consts before the bot, extend the `.install()` chain and even replace
 * the bootstrap (`bot.start()` → `serve()` / `run()`). everything it generates
 * type-checks against the real `@yaebal/*` apis.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { findPlugin, type PackageManager, type Runtime, type TemplateId } from "./catalog.js";

export interface ScaffoldOptions {
	name: string;
	runtime: Runtime;
	plugins: string[];
	packageManager?: PackageManager;
	template?: TemplateId;
}

/** codegen recipe for a starter template. */
interface TemplateSpec {
	/** plugin ids the template needs — added to deps, wired by the template itself */
	plugins?: string[];
	/** real import lines the body/pre code needs */
	imports?: string[];
	/** code emitted just before `const bot = …` (consts, defs) */
	pre?: string;
	/** extra `.install(expr)` entries appended to the chain */
	install?: string[];
	/** the handlers — statements after the bot is built */
	body: string;
	/** statements run after the body (e.g. against `bot.api`) */
	setup?: string;
	/** replaces the default `await bot.start()` bootstrap */
	bootstrap?: string;
	/** extra project files the template ships (path → contents) */
	files?: Record<string, string>;
}

interface Scripts {
	dev: string;
	start: string;
}

type BotTemplateId = Exclude<TemplateId, "plugin">;
type NodePackageManager = Exclude<PackageManager, "deno">;

interface PluginIdentifiers {
	exportName: string;
	contextKey: string;
	optionsType: string;
	controlType: string;
	contextType: string;
}

const SCRIPTS: Record<Runtime, Scripts> = {
	node: {
		dev: "node --watch --experimental-strip-types src/index.ts",
		start: "node --experimental-strip-types src/index.ts",
	},
	bun: { dev: "bun --watch src/index.ts", start: "bun src/index.ts" },
	deno: {
		dev: "deno run --watch --allow-net --allow-env src/index.ts",
		start: "deno run --allow-net --allow-env src/index.ts",
	},
};

const DEFAULT_BOOTSTRAP = `await bot.start();
console.log("✓ bot is running — press ctrl-c to stop");`;

const BOT_TEMPLATES: Record<BotTemplateId, TemplateSpec> = {
	minimal: {
		body: `bot.command("start", (ctx) => ctx.reply("hello! i'm a yaebal bot 🤖"));
bot.on("message:text", (ctx) => ctx.reply(ctx.text));`,
	},
	echo: {
		body: `bot.command("start", (ctx) => ctx.reply("send me anything and i'll echo it back ✨"));
bot.on("message:text", (ctx) => ctx.reply(ctx.text));
bot.on("message:photo", (ctx) => ctx.reply("nice photo! 📸"));
bot.on("message:sticker", (ctx) => ctx.reply("cool sticker 🎨"));`,
	},
	commands: {
		plugins: ["commands"],
		imports: ['import { commands } from "@yaebal/commands";'],
		pre: `// one registry for the handlers and the telegram / menu
const cmd = commands()
\t.add("start", "say hello", (ctx) => ctx.reply("hello! i'm a yaebal bot 🤖"))
\t.add("ping", "check the bot is alive", (ctx) => ctx.reply("pong 🏓"));

// added separately so the handler can reference \`cmd\` itself
cmd.add("help", "list all commands", (ctx) =>
\tctx.reply(cmd.list().map((c) => \`/\${c.command} — \${c.description}\`).join("\\n")),
);`,
		install: ["cmd.plugin()"],
		body: `bot.on("message:text", (ctx) => ctx.reply(\`you said: \${ctx.text}\`));`,
		bootstrap: `await cmd.sync(bot.api); // push the / menu — only the menus that changed

await bot.start();
console.log("✓ bot is running — press ctrl-c to stop");`,
	},
	buttons: {
		plugins: ["keyboard", "callback-data"],
		imports: [
			'import { InlineKeyboard } from "@yaebal/keyboard";',
			'import { callbackData } from "@yaebal/callback-data";',
		],
		pre: 'const vote = callbackData("vote", { choice: String });',
		body: `bot.command("start", (ctx) =>
\tctx.reply("tap a button 👇", {
\t\treply_markup: new InlineKeyboard()
\t\t\t.text("👍 like", vote.pack({ choice: "up" }))
\t\t\t.text("👎 dislike", vote.pack({ choice: "down" }))
\t\t\t.style("danger") // styles the button just added — "👎 dislike"
\t\t\t.build(),
\t}),
);

bot.callbackQuery(vote.pattern, async (ctx) => {
\tconst choice = vote.unpack(ctx.callbackQuery.data ?? "")?.choice;
\tawait ctx.answerCallbackQuery({ text: choice === "up" ? "liked 👍" : "disliked 👎" });
});`,
	},
	conversation: {
		plugins: ["conversation"],
		imports: ['import { conversation, createConversation } from "@yaebal/conversation";'],
		pre: `const greet = createConversation("greet", async (cv, ctx) => {
\tawait ctx.reply("what's your name?");
\tconst name = await cv.wait();
\tawait name.reply(\`hi, \${name.text}! how old are you?\`);
\tconst age = await cv.wait();
\tawait age.reply(\`\${age.text} — nice to meet you ✨\`);
});`,
		install: ["conversation([greet])"],
		body: `bot.command("start", (ctx) => ctx.reply("type /greet to start a short chat"));
bot.command("greet", (ctx) => ctx.conversation.enter("greet"));`,
	},
	i18n: {
		plugins: ["i18n"],
		imports: ['import { i18n } from "@yaebal/i18n";'],
		pre: `const locales = {
\ten: { hi: "hi there! 🇬🇧", switched: "language set to english" },
\tru: { hi: "привет! 🇷🇺", switched: "язык переключён на русский" },
};`,
		install: ['i18n({ defaultLocale: "en", locales })'],
		body: `bot.command("start", (ctx) => ctx.reply(ctx.t("hi")));
bot.command("lang", async (ctx) => {
\tawait ctx.changeLanguage(ctx.locale === "ru" ? "en" : "ru");
\treturn ctx.reply(ctx.t("switched"));
});`,
	},
	"session-counter": {
		plugins: ["session"],
		imports: ['import { session } from "@yaebal/session";'],
		install: ["session({ initial: () => ({ count: 0 }) })"],
		body: `bot.command("start", (ctx) => ctx.reply("send /count to bump your per-chat counter"));
bot.command("count", (ctx) => {
\tctx.session.count++;
\treturn ctx.reply(\`you've hit /count \${ctx.session.count} time(s)\`);
});`,
	},
	webhook: {
		plugins: ["web"],
		imports: ['import { serve } from "@yaebal/web";'],
		body: `bot.command("start", (ctx) => ctx.reply("hello from a webhook bot 🤖"));
bot.on("message:text", (ctx) => ctx.reply(ctx.text));`,
		bootstrap: `const port = Number(process.env.PORT ?? 8080);

// point telegram at your public https url once (run this separately or here):
// await bot.api.call("setWebhook", { url: "https://your.domain/" });

serve(bot, { port });
console.log(\`✓ webhook server listening on :\${port}\`);`,
	},
	runner: {
		plugins: ["runner"],
		imports: ['import { run } from "@yaebal/runner";'],
		body: `bot.command("start", (ctx) => ctx.reply("hello! your updates run concurrently ⚡"));
bot.on("message:text", (ctx) => ctx.reply(ctx.text));`,
		bootstrap: `const handle = run(bot, { concurrency: 50 });
process.once("SIGINT", () => handle.stop());
console.log("✓ runner polling (concurrency 50) — press ctrl-c to stop");`,
	},
	"rich-message": {
		plugins: ["rich"],
		imports: ['import { rich, document, heading, paragraph, bold, thinking } from "@yaebal/rich";'],
		install: ["rich()"],
		body: `bot.command("start", (ctx) =>
\tctx.sendRichMessage(
\t\tdocument([
\t\t\theading(1, "hello!"),
\t\t\tparagraph("this is a ", bold("rich message"), " — a block-tree document, not just text."),
\t\t]),
\t),
);

bot.command("ask", async (ctx) => {
\t// sendRichMessageDraft is ephemeral (30s) and never persists on its own —
\t// RichMessageDraft keeps it alive and requires an explicit send().
\tconst draft = ctx.richMessageDraft(1);
\tawait draft.rewrite(document([thinking("thinking…")]));

\tawait new Promise((resolve) => setTimeout(resolve, 800)); // stand in for a real llm stream

\tawait draft.send(document([paragraph("here's your (fake) streamed answer ✨")]));
		});`,
	},
	broadcast: {
		plugins: ["broadcast"],
		imports: ['import { Broadcast } from "@yaebal/broadcast";'],
		body: `const subscribers = new Set<number>();

const broadcaster = new Broadcast(bot.api, {
	concurrency: 3,
	rateLimit: { limit: 20, windowMs: 1_000 },
	retry: { attempts: 5, fixedDelayMs: 1_000 },
}).type("digest", (chatId: number, text: string) =>
	bot.api.sendMessage({ chat_id: chatId, text, disable_notification: true }),
);

bot.command("start", (ctx) => {
	if (ctx.chat?.id !== undefined) subscribers.add(ctx.chat.id);
	return ctx.reply("subscribed. send /broadcast text to queue a local demo broadcast.");
});

bot.command("broadcast", async (ctx) => {
	const text = ctx.args.join(" ").trim();
	if (!text) return ctx.reply("usage: /broadcast text");

	const audience = [...subscribers];
	if (audience.length === 0) return ctx.reply("no subscribers yet.");

	const job = await broadcaster.start(
		"digest",
		audience.map((chatId) => [chatId, text] as const),
	);
	await ctx.reply("queued " + audience.length + " deliveries. job id: " + job.id);

	const result = await job.wait();
	return ctx.reply(
		"done: " + result.sent + " sent, " + result.skipped + " skipped, " + result.failed + " failed.",
	);
});

bot.command("status", async (ctx) => {
	const jobs = (await broadcaster.listJobs()).slice(-5).reverse();
	return ctx.reply(
		jobs.map((job) => job.id + ": " + job.status + " " + job.sent + "/" + job.total + " sent").join("\\n") ||
			"no jobs yet.",
	);
});

bot.onStop(() => broadcaster.stop({ drain: true }));`,
	},
	toml: {
		plugins: ["toml"],
		imports: ['import { installToml } from "@yaebal/toml";'],
		body: `installToml(bot, "./bot.toml", {
\tsyncCommands: true, // push described commands to the / menu on start
\thandlers: {
\t\tping: async (ctx) => {
\t\t\tawait ctx.reply("pong from typescript 🏓");
\t\t},
\t},
});`,
		files: {
			"bot.toml": `# declarative routes — edit replies without touching typescript.
# every route needs either reply = "..." or handler = "name" (from installToml handlers).

[[commands]]
name = "start"
description = "say hello"
reply = "hello! i'm a yaebal bot described in toml 🤖"

[[commands]]
name = "ping"
description = "check the bot is alive"
handler = "ping"

[[hears]]
regex = "^(hi|hello)$"
reply = "hey there 👋"

[[messages]]
on = "message:text"
contains = "yaebal"
reply = "you said the magic word ✨"
`,
		},
	},
};

const RESERVED_IDENTIFIERS = new Set([
	"await",
	"break",
	"case",
	"catch",
	"class",
	"const",
	"continue",
	"debugger",
	"default",
	"delete",
	"do",
	"else",
	"enum",
	"export",
	"extends",
	"false",
	"finally",
	"for",
	"function",
	"if",
	"import",
	"in",
	"instanceof",
	"new",
	"null",
	"return",
	"super",
	"switch",
	"this",
	"throw",
	"true",
	"try",
	"typeof",
	"var",
	"void",
	"while",
	"with",
	"yield",
]);

/** default package manager that matches a runtime when the user didn't pick one */
export function defaultPackageManager(runtime: Runtime): PackageManager {
	if (runtime === "bun") return "bun";
	if (runtime === "deno") return "deno";
	return "pnpm";
}

/** library packages are authored for npm-style package managers; deno falls back to pnpm. */
export function nodePackageManager(pm: PackageManager): NodePackageManager {
	return pm === "deno" ? "pnpm" : pm;
}

const pkgOf = (importLine: string): string | undefined => importLine.match(/from "([^"]+)"/)?.[1];

function wordsFromName(name: string): string[] {
	const unscoped = name.split("/").pop() ?? name;
	const words = unscoped
		.replace(/^yaebal[._-]/, "")
		.replace(/^plugin[._-]/, "")
		.split(/[^a-zA-Z0-9]+/)
		.filter(Boolean);

	return words.length > 0 ? words : ["plugin"];
}

function upperFirst(value: string): string {
	return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

function safeIdentifier(value: string): string {
	let id = value.replace(/[^a-zA-Z0-9_$]/g, "");
	if (!/^[a-zA-Z_$]/.test(id)) id = `yaebal${upperFirst(id)}`;
	if (RESERVED_IDENTIFIERS.has(id)) id = `${id}Plugin`;
	return id;
}

function pluginIdentifiers(name: string): PluginIdentifiers {
	const words = wordsFromName(name);
	const [first = "plugin", ...rest] = words;
	const base = safeIdentifier(
		[first.toLowerCase(), ...rest.map((word) => upperFirst(word.toLowerCase()))].join(""),
	);
	const pascal = upperFirst(base);

	return {
		exportName: base,
		contextKey: base,
		optionsType: `${pascal}Options`,
		controlType: `${pascal}Control`,
		contextType: `${pascal}Context`,
	};
}

function renderPluginSource(name: string, ids: PluginIdentifiers): string {
	return `import type { Context, Plugin } from "@yaebal/core";

export interface ${ids.optionsType} {
	/** Text prepended by the sample formatter. Replace this with your real options. */
	prefix?: string;
}

export interface ${ids.controlType} {
	format(message: string): string;
	reply(message: string): ReturnType<Context["reply"]>;
}

export interface ${ids.contextType} {
	${ids.contextKey}: ${ids.controlType};
}

/** Adds \`ctx.${ids.contextKey}\` to every update. */
export function ${ids.exportName}(options: ${ids.optionsType} = {}): Plugin<Context, ${ids.contextType}> {
	const prefix = options.prefix ?? ${JSON.stringify(name)};

	return (composer) =>
		composer.derive((ctx) => {
			const control: ${ids.controlType} = {
				format(message) {
					return \`\${prefix} \${message}\`;
				},
				reply(message) {
					return ctx.reply(control.format(message));
				},
			};

			return { ${ids.contextKey}: control };
		});
}
`;
}

function renderPluginTest(ids: PluginIdentifiers): string {
	return `import assert from "node:assert/strict";
import test from "node:test";
import { Bot } from "@yaebal/core";
import { ${ids.exportName} } from "./index.js";

test("${ids.exportName}: adds ctx.${ids.contextKey}", async () => {
	let formatted = "";

	const bot = new Bot("123:abc")
		.install(${ids.exportName}({ prefix: "test" }))
		.on("message:text", (ctx) => {
			formatted = ctx.${ids.contextKey}.format(ctx.text);
		});

	await bot.handleUpdate({
		update_id: 1,
		message: {
			message_id: 1,
			date: 0,
			chat: { id: 1, type: "private" },
			text: "hello",
		},
	} as never);

	assert.equal(formatted, "test hello");
});
`;
}

function renderPluginExample(ids: PluginIdentifiers): string {
	return `import { Bot } from "@yaebal/core";
import { ${ids.exportName} } from "../lib/index.js";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in your environment (see .env.example)");
	process.exit(1);
}

const bot = new Bot(token).install(${ids.exportName}({ prefix: "example" }));

bot.command("start", (ctx) => ctx.${ids.contextKey}.reply("hello from your plugin"));
bot.on("message:text", (ctx) => ctx.${ids.contextKey}.reply(ctx.text));

await bot.start();
console.log("bot is running - press ctrl-c to stop");
`;
}

function renderPluginFiles(opts: ScaffoldOptions): Record<string, string> {
	const pm = nodePackageManager(opts.packageManager ?? defaultPackageManager(opts.runtime));
	const ids = pluginIdentifiers(opts.name);

	const pkg = {
		name: opts.name,
		version: "0.0.0",
		description: "A yaebal plugin.",
		type: "module",
		main: "./lib/index.js",
		types: "./lib/index.d.ts",
		exports: {
			".": {
				types: "./lib/index.d.ts",
				import: "./lib/index.js",
			},
		},
		files: ["lib", "src", "examples"],
		scripts: {
			build: "tsc -p tsconfig.json",
			typecheck: "tsc -p tsconfig.json --noEmit",
			test: "tsc -p tsconfig.json && node --test lib/*.test.js",
			example: "tsc -p tsconfig.json && node examples/basic.mjs",
			prepack: "npm run build",
		},
		peerDependencies: { "@yaebal/core": ">=0.0.0" },
		devDependencies: {
			"@types/node": "^22.0.0",
			"@yaebal/core": "latest",
			typescript: "^5.7.0",
		},
		engines: { node: ">=20" },
		keywords: ["telegram", "telegram-bot", "yaebal", "plugin"],
		license: "MIT",
	};

	const tsconfig = {
		compilerOptions: {
			target: "ES2022",
			module: "NodeNext",
			moduleResolution: "NodeNext",
			lib: ["ES2023"],
			declaration: true,
			declarationMap: true,
			sourceMap: true,
			strict: true,
			noUncheckedIndexedAccess: true,
			noImplicitOverride: true,
			esModuleInterop: true,
			forceConsistentCasingInFileNames: true,
			skipLibCheck: true,
			verbatimModuleSyntax: true,
			isolatedModules: true,
			rootDir: "src",
			outDir: "lib",
			types: ["node"],
		},
		include: ["src/**/*.ts"],
	};

	const installCmd = installCommand(pm);
	const typecheckCmd = scriptCommand(pm, "typecheck");
	const testCmd = scriptCommand(pm, "test");
	const buildCmd = scriptCommand(pm, "build");
	const exampleCmd = scriptCommand(pm, "example");

	const readme = `# ${opts.name}

A ready-to-edit [yaebal](https://github.com/neverlane/yaebal) plugin package.

## Layout

- \`src/index.ts\` - plugin implementation and public types
- \`src/index.test.ts\` - type-safe smoke test for the context extension
- \`examples/basic.mjs\` - tiny bot using the built plugin
- \`package.json\` - ESM exports, build/test scripts, peer dependency on \`@yaebal/core\`

## Quick Start

\`\`\`sh
${installCmd}
${typecheckCmd}
${testCmd}
${buildCmd}
\`\`\`

## Try The Example

\`\`\`sh
# export BOT_TOKEN=123:abc or load it from .env yourself
${exampleCmd}
\`\`\`

The sample plugin exports \`${ids.exportName}()\` and adds \`ctx.${ids.contextKey}\`. Rename those identifiers when you replace the sample behavior.
`;

	return {
		"package.json": `${JSON.stringify(pkg, null, "\t")}\n`,
		"tsconfig.json": `${JSON.stringify(tsconfig, null, "\t")}\n`,
		"src/index.ts": renderPluginSource(opts.name, ids),
		"src/index.test.ts": renderPluginTest(ids),
		"examples/basic.mjs": renderPluginExample(ids),
		".env.example": "BOT_TOKEN=\n",
		".gitignore": "node_modules\nlib\n.env\n*.log\n",
		"README.md": readme,
	};
}

/** turn options into a `relative path → file content` map. pure. */
export function renderFiles(opts: ScaffoldOptions): Record<string, string> {
	const templateId = opts.template ?? "minimal";
	if (templateId === "plugin") return renderPluginFiles(opts);

	const spec = BOT_TEMPLATES[templateId];
	const pm = opts.packageManager ?? defaultPackageManager(opts.runtime);

	const chosen = opts.plugins.map(findPlugin).filter((p): p is NonNullable<typeof p> => !!p);
	const templatePlugins = (spec.plugins ?? [])
		.map(findPlugin)
		.filter((p): p is NonNullable<typeof p> => !!p);
	const templateIds = new Set(templatePlugins.map((p) => p.id));

	// the template owns the wiring for its own plugins, so the user-selected
	// ones are partitioned with those removed (no double installs).
	const wired = chosen.filter((p) => !templateIds.has(p.id));
	const installs = wired.filter((p) => p.wire === "install");
	const setups = wired.filter((p) => p.wire === "setup");
	const depOnly = wired.filter((p) => p.wire === "dep");

	// ── imports ──────────────────────────────────────────────────────────
	const imports = [
		'import { Bot } from "@yaebal/core";',
		...installs.map((p) => p.import),
		...setups.map((p) => p.import),
		...(spec.imports ?? []),
	];
	const importBlock = [...new Set(imports)].join("\n");

	// dep-only plugins get a commented import — unless the template already
	// imports that package for real.
	const importedPackages = new Set([
		...installs.map((p) => p.dep),
		...setups.map((p) => p.dep),
		...(spec.imports ?? []).map(pkgOf).filter((p): p is string => !!p),
	]);
	const depHints = depOnly.filter((p) => !importedPackages.has(p.dep));
	const depHint =
		depHints.length > 0
			? `\n\n// extra plugins you added — import & wire them as you need:\n${depHints
					.map((p) => `// ${p.import}`)
					.join("\n")}`
			: "";

	// ── bot construction ───────────────────────────────────────────────────
	const installExprs = [...installs.map((p) => p.install as string), ...(spec.install ?? [])];
	const installChain =
		installExprs.length > 0 ? `\n${installExprs.map((e) => `\t.install(${e})`).join("\n")}` : "";

	const setupStatements = [...setups.map((p) => p.setup as string)];
	if (spec.setup) setupStatements.push(spec.setup);
	const setupBlock =
		setupStatements.length > 0
			? `\n\n// transformers applied to the outgoing api\n${setupStatements.join("\n")}`
			: "";

	const pre = spec.pre ? `${spec.pre}\n\n` : "";
	const bootstrap = spec.bootstrap ?? DEFAULT_BOOTSTRAP;

	const index = `${importBlock}${depHint}

const token = process.env.BOT_TOKEN;
if (!token) {
\tconsole.error("✗ set BOT_TOKEN in your environment (copy .env.example → .env)");
\tprocess.exit(1);
}

${pre}const bot = new Bot(token)${installChain};

${spec.body}${setupBlock}

${bootstrap}
`;

	// ── package.json ──────────────────────────────────────────────────────
	const dependencies: Record<string, string> = { "@yaebal/core": "latest" };
	for (const p of [...chosen, ...templatePlugins]) dependencies[p.dep] = "latest";

	const pkg = {
		name: opts.name,
		version: "0.0.0",
		private: true,
		type: "module",
		scripts: SCRIPTS[opts.runtime],
		dependencies,
		devDependencies: { "@types/node": "^22.0.0", typescript: "^5.7.0" },
		engines: opts.runtime === "node" ? { node: ">=22.6" } : undefined,
	};

	const tsconfig = {
		compilerOptions: {
			target: "ES2022",
			module: "NodeNext",
			moduleResolution: "NodeNext",
			lib: ["ES2023"],
			strict: true,
			noUncheckedIndexedAccess: true,
			verbatimModuleSyntax: true,
			skipLibCheck: true,
			allowImportingTsExtensions: true,
			noEmit: true,
			types: ["node"],
		},
		include: ["src"],
	};

	const runCmd = runCommand(pm, "dev");
	const installCmd = installCommand(pm);
	const allPlugins = [...new Set([...chosen.map((p) => p.id), ...templateIds])];

	const readme = `# ${opts.name}

a telegram bot built with [yaebal](https://github.com/neverlane/yaebal) — type-safe, runtime-agnostic.

## quick start

\`\`\`sh
# 1. install deps
${installCmd}

# 2. add your token
cp .env.example .env   # then put your BOT_TOKEN in it

# 3. run (watch mode)
${runCmd}
\`\`\`

runtime: **${opts.runtime}** · template: **${templateId}**${
		allPlugins.length ? ` · plugins: ${allPlugins.join(", ")}` : ""
	}
`;

	return {
		"package.json": `${JSON.stringify(pkg, null, "\t")}\n`,
		"tsconfig.json": `${JSON.stringify(tsconfig, null, "\t")}\n`,
		"src/index.ts": index,
		".env.example": "BOT_TOKEN=\n",
		".gitignore": "node_modules\nlib\n.env\n*.log\n",
		"README.md": readme,
		...(spec.files ?? {}),
	};
}

/** the install command for a package manager (deno has none) */
export function installCommand(pm: PackageManager): string {
	switch (pm) {
		case "npm":
			return "npm install";
		case "yarn":
			return "yarn";
		case "bun":
			return "bun install";
		case "deno":
			return "deno cache src/index.ts";
		default:
			return "pnpm install";
	}
}

/** the `<pm> run <script>` invocation (npm/yarn/bun) or runtime command (deno) */
export function runCommand(pm: PackageManager, script: "dev" | "start"): string {
	switch (pm) {
		case "npm":
			return `npm run ${script}`;
		case "yarn":
			return `yarn ${script}`;
		case "bun":
			return `bun run ${script}`;
		case "deno":
			return script === "dev" ? SCRIPTS.deno.dev : SCRIPTS.deno.start;
		default:
			return `pnpm ${script}`;
	}
}

/** the package-manager-neutral way to run a package.json script. */
export function scriptCommand(pm: PackageManager, script: string): string {
	switch (nodePackageManager(pm)) {
		case "npm":
			return `npm run ${script}`;
		case "yarn":
			return `yarn ${script}`;
		case "bun":
			return `bun run ${script}`;
		default:
			return `pnpm ${script}`;
	}
}

/** flush a rendered file map to `targetDir`, creating parent dirs as needed. */
export async function writeProject(
	targetDir: string,
	files: Record<string, string>,
): Promise<void> {
	for (const [rel, content] of Object.entries(files)) {
		const full = join(targetDir, rel);
		await mkdir(dirname(full), { recursive: true });
		await writeFile(full, content);
	}
}
