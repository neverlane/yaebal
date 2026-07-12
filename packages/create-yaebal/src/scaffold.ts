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

import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	type DeployTarget,
	findPlugin,
	type PackageManager,
	type Runtime,
	type TemplateId,
} from "./catalog.js";

export interface ScaffoldOptions {
	name: string;
	runtime: Runtime;
	plugins: string[];
	packageManager?: PackageManager;
	template?: TemplateId;
	/** where the bot deploys — infra files, and for cloudflare/vercel, the bootstrap itself */
	deploy?: DeployTarget;
	/** ship a github actions ci workflow (install → typecheck) */
	ci?: boolean;
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
	typecheck: string;
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
		typecheck: "tsc --noEmit",
	},
	bun: {
		dev: "bun --watch src/index.ts",
		start: "bun src/index.ts",
		typecheck: "tsc --noEmit",
	},
	deno: {
		dev: "deno run --watch --allow-net --allow-env src/index.ts",
		start: "deno run --allow-net --allow-env src/index.ts",
		typecheck: "tsc --noEmit",
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
			'import { callbackData, field } from "@yaebal/callback-data";',
		],
		pre: 'const vote = callbackData("vote", { choice: field.enum(["up", "down"]) });',
		body: `bot.command("start", (ctx) =>
\tctx.reply("tap a button 👇", {
\t\treply_markup: new InlineKeyboard()
\t\t\t.text("👍 like", vote.pack({ choice: "up" }))
\t\t\t.text("👎 dislike", vote.pack({ choice: "down" }))
\t\t\t.style("danger") // styles the button just added — "👎 dislike"
\t\t\t.build(),
\t}),
);

// pass the namespace itself — ctx.queryData is typed ("up" | "down") and this
// handler runs only when the payload cleanly unpacks
bot.callbackQuery(vote, async (ctx) => {
\tawait ctx.answerCallbackQuery({
\t\ttext: ctx.queryData.choice === "up" ? "liked 👍" : "disliked 👎",
\t});
});`,
	},
	conversation: {
		plugins: ["conversation"],
		imports: ['import { conversation, createConversation } from "@yaebal/conversation";'],
		pre: `const greet = createConversation(async (cv, ctx) => {
\tawait ctx.reply("what's your name?");
\tconst name = await cv.waitFor("message:text");
\tawait name.reply(\`hi, \${name.text}! how old are you?\`);
\tconst age = await cv.waitFor("message:text");
\tawait age.reply(\`\${age.text} — nice to meet you ✨\`);
});`,
		install: ["conversation({ greet })"],
		body: `bot.command("start", (ctx) => ctx.reply("type /greet to start a short chat"));
bot.command("greet", (ctx) => ctx.conversation.enter("greet"));`,
	},
	i18n: {
		plugins: ["i18n"],
		imports: ['import { i18n } from "@yaebal/i18n";'],
		pre: `// \`as const\` gives ctx.t typed keys and typed params; the first locale a
// user sees is auto-detected from telegram's language_code.
const locales = {
\ten: { hi: "hi there! 🇬🇧", switched: "language set to english" },
\tru: { hi: "привет! 🇷🇺", switched: "язык переключён на русский" },
} as const;`,
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
		imports: ['import { serve, setWebhook } from "@yaebal/web";'],
		body: `bot.command("start", (ctx) => ctx.reply("hello from a webhook bot 🤖"));
bot.on("message:text", (ctx) => ctx.reply(ctx.text));`,
		bootstrap: `const port = Number(process.env.PORT ?? 8080);
const secretToken = process.env.WEBHOOK_SECRET;

const server = await serve(bot, { port, secretToken });
process.once("SIGINT", () => server.stop());
console.log(\`✓ webhook server listening on \${server.url}\`);

// point telegram at your public https url once (e.g. behind a tunnel / on deploy):
if (process.env.PUBLIC_URL) {
\tawait setWebhook(bot, process.env.PUBLIC_URL, { secretToken });
}`,
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

/**
 * names the plugin template's own generated files import or declare at module
 * scope: `bot`/`token` (the local const + its initializer arg in
 * `examples/basic.mjs`), `test`/`assert` (the default imports in
 * `src/index.test.ts`), `process` (the global `examples/basic.mjs` reads
 * `process.env`/`process.exit` from). if a plugin's derived identifier landed
 * on one of these it would shadow or collide with them — a self-referencing
 * `const bot = new Bot(token).install(bot(...))` (TDZ), a duplicate `test`/
 * `assert` import, or a shadowed `process` — so they get the same "Plugin"
 * suffix treatment as a reserved JS keyword.
 */
const RESERVED_CODEGEN_BINDINGS = new Set(["bot", "test", "assert", "token", "process"]);

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
	if (RESERVED_IDENTIFIERS.has(id) || RESERVED_CODEGEN_BINDINGS.has(id)) id = `${id}Plugin`;
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
		// pinned to the current core line, not ">=0.0.0" — pre-1.0 @yaebal/core
		// still makes breaking changes between minors, so an unbounded range would
		// silently accept a future release the plugin was never checked against.
		peerDependencies: { "@yaebal/core": ">=0.3.0" },
		devDependencies: {
			"@types/node": "latest",
			"@yaebal/core": "latest",
			typescript: "^6.0.3",
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

	const files: Record<string, string> = {
		"package.json": `${JSON.stringify(pkg, null, "\t")}\n`,
		"tsconfig.json": `${JSON.stringify(tsconfig, null, "\t")}\n`,
		"src/index.ts": renderPluginSource(opts.name, ids),
		"src/index.test.ts": renderPluginTest(ids),
		"examples/basic.mjs": renderPluginExample(ids),
		".env.example": "BOT_TOKEN=\n",
		".gitignore": "node_modules\nlib\n.env\n*.log\n",
		"README.md": readme,
	};

	if (opts.ci) files[".github/workflows/ci.yml"] = pluginCiWorkflow(pm);

	return files;
}

const DOCKERIGNORE = `node_modules
.env
.dev.vars
*.log
.git
.gitignore
`;

/**
 * single-stage on purpose: these templates run straight from `.ts` (node's
 * type-stripping, or bun/deno's native ts support) — there's no build output
 * to copy out of a separate builder stage.
 */
function dockerfile(runtime: Runtime): string {
	if (runtime === "bun") {
		return `FROM oven/bun:1-alpine
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY . .

ENV NODE_ENV=production
CMD ["bun", "src/index.ts"]
`;
	}

	if (runtime === "deno") {
		return `FROM denoland/deno:alpine
WORKDIR /app

COPY . .
RUN deno cache src/index.ts

ENV NODE_ENV=production
CMD ["deno", "run", "--allow-net", "--allow-env", "src/index.ts"]
`;
	}

	return `FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN if [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --prod --frozen-lockfile; \\
	elif [ -f yarn.lock ]; then corepack enable && yarn install --production --frozen-lockfile; \\
	else npm install --omit=dev; fi

COPY . .

ENV NODE_ENV=production
CMD ["node", "--experimental-strip-types", "src/index.ts"]
`;
}

function composeYaml(name: string): string {
	return `services:
  ${name}:
    build: .
    env_file: .env
    restart: unless-stopped
`;
}

function flyToml(name: string): string {
	return `app = "${name}"
primary_region = "iad"

[build]

# a long-polling bot has no inbound http to expose — fly just keeps the
# container's Dockerfile CMD running as a background machine.
`;
}

function railwayJson(): string {
	return `${JSON.stringify(
		{
			$schema: "https://railway.app/railway.schema.json",
			build: { builder: "DOCKERFILE" },
			deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 10 },
		},
		null,
		"\t",
	)}\n`;
}

function wranglerJsonc(name: string): string {
	return `{
	// generated by create-yaebal — https://developers.cloudflare.com/workers/wrangler/configuration/
	"name": "${name}",
	"main": "src/index.ts",
	"compatibility_date": "2026-01-01",
	// makes \`process.env\` read from vars/secrets, so the generated bot reads
	// BOT_TOKEN/SECRET_TOKEN exactly the way it does on every other runtime
	"compatibility_flags": ["nodejs_compat"]
}
`;
}

function vercelJson(): string {
	return `${JSON.stringify({ $schema: "https://openapi.vercel.sh/vercel.json", framework: null }, null, "\t")}\n`;
}

function ciSetupStep(pm: PackageManager): string {
	if (pm === "deno") {
		return `      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x`;
	}
	if (pm === "bun") return `      - uses: oven-sh/setup-bun@v2`;

	const cache = pm === "yarn" ? "yarn" : pm === "pnpm" ? "pnpm" : "npm";
	return `      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: ${cache}`;
}

function ciWorkflow(pm: PackageManager): string {
	const pnpmSetup = pm === "pnpm" ? "      - uses: pnpm/action-setup@v6\n" : "";

	return `name: ci

on:
  push:
  pull_request:

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
${pnpmSetup}${ciSetupStep(pm)}
      - run: ${installCommand(pm)}
      - run: ${scriptCommand(pm, "typecheck")}
`;
}

/** a plugin package is publishable, so its ci also builds and runs its tests. */
function pluginCiWorkflow(pm: PackageManager): string {
	const pnpmSetup = pm === "pnpm" ? "      - uses: pnpm/action-setup@v6\n" : "";

	return `name: ci

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
${pnpmSetup}${ciSetupStep(pm)}
      - run: ${installCommand(pm)}
      - run: ${scriptCommand(pm, "typecheck")}
      - run: ${scriptCommand(pm, "test")}
      - run: ${scriptCommand(pm, "build")}
`;
}

/** what a `DeployTarget` adds: infra files, plus (serverless targets only) a bootstrap override. */
interface DeployOutput {
	files: Record<string, string>;
	/** replaces the default bootstrap — cloudflare owns `src/index.ts`'s export the way `webhook`/`runner` templates already replace it */
	bootstrap?: string;
	/** real import line(s) the override needs, merged into `src/index.ts`'s imports */
	imports?: string[];
	/** extra package.json dependencies the target needs */
	dependencies?: Record<string, string>;
	/** env var names (beyond `BOT_TOKEN`) the target expects, added to `.env.example` */
	envVars?: string[];
}

function renderDeployFiles(opts: ScaffoldOptions): DeployOutput {
	switch (opts.deploy ?? "none") {
		case "none":
			return { files: {} };
		case "docker":
			return { files: { Dockerfile: dockerfile(opts.runtime), ".dockerignore": DOCKERIGNORE } };
		case "compose":
			return {
				files: {
					Dockerfile: dockerfile(opts.runtime),
					".dockerignore": DOCKERIGNORE,
					"compose.yaml": composeYaml(opts.name),
				},
			};
		case "fly":
			return {
				files: {
					Dockerfile: dockerfile(opts.runtime),
					".dockerignore": DOCKERIGNORE,
					"fly.toml": flyToml(opts.name),
				},
			};
		case "railway":
			return {
				files: {
					Dockerfile: dockerfile(opts.runtime),
					".dockerignore": DOCKERIGNORE,
					"railway.json": railwayJson(),
				},
			};
		case "cloudflare":
			return {
				files: {
					"wrangler.jsonc": wranglerJsonc(opts.name),
					".dev.vars.example": "BOT_TOKEN=\nSECRET_TOKEN=\n",
				},
				bootstrap: `export default {
	fetch: cloudflareAdapter(bot, { secretToken: process.env.SECRET_TOKEN }),
};
`,
				imports: ['import { cloudflareAdapter } from "@yaebal/web";'],
				dependencies: { "@yaebal/web": "latest" },
				envVars: ["SECRET_TOKEN"],
			};
		case "vercel":
			// api/bot.ts (the actual edge entry) is assembled in renderFiles, which
			// alone has the rest of the generated body to reuse — this only owns
			// the target's static, body-independent files.
			return {
				files: { "vercel.json": vercelJson() },
				dependencies: { "@yaebal/web": "latest" },
				envVars: ["SECRET_TOKEN"],
			};
	}
}

/** turn options into a `relative path → file content` map. pure. */
export function renderFiles(opts: ScaffoldOptions): Record<string, string> {
	const templateId = opts.template ?? "minimal";
	if (templateId === "plugin") return renderPluginFiles(opts);

	const spec = BOT_TEMPLATES[templateId];
	const pm = opts.packageManager ?? defaultPackageManager(opts.runtime);
	const deployTarget = opts.deploy ?? "none";
	const deployOut = renderDeployFiles(opts);

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
	const baseImports = [
		'import { Bot } from "@yaebal/core";',
		...installs.map((p) => p.import),
		...setups.map((p) => p.import),
		...(spec.imports ?? []),
	];

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

	// showcase comments for plugins that ship more than one backend (analytics
	// sinks, feature-flags providers) — real, importable names, never live code.
	const showcases = [...installs, ...setups].map((p) => p.showcase).filter((s): s is string => !!s);
	const showcaseBlock = showcases.length > 0 ? `\n\n${showcases.join("\n\n")}` : "";

	const setupStatements = [...setups.map((p) => p.setup as string)];
	if (spec.setup) setupStatements.push(spec.setup);
	const setupBlock =
		setupStatements.length > 0
			? `\n\n// transformers applied to the outgoing api\n${setupStatements.join("\n")}`
			: "";

	const pre = spec.pre ? `${spec.pre}\n\n` : "";
	const tokenGuard = `const token = process.env.BOT_TOKEN;
if (!token) {
\tconsole.error("✗ set BOT_TOKEN in your environment (copy .env.example → .env)");
\tprocess.exit(1);
}`;

	/** everything but the bootstrap — shared between `src/index.ts` and, for vercel, `api/bot.ts`. */
	const buildBody = (extraImports: string[] = []): string => {
		const importBlock = [...new Set([...baseImports, ...extraImports])].join("\n");
		return `${importBlock}${depHint}

${tokenGuard}

${pre}const bot = new Bot(token)${installChain};${showcaseBlock}

${spec.body}${setupBlock}`;
	};

	// a serverless deploy target owns the bootstrap the same way the `webhook`/
	// `runner` templates already do — it wins regardless of which bot template
	// was picked, since there's nowhere else for a `bot.start()` poll loop to run.
	const bootstrap = deployOut.bootstrap ?? spec.bootstrap ?? DEFAULT_BOOTSTRAP;
	const indexExtraImports = deployTarget === "cloudflare" ? (deployOut.imports ?? []) : [];

	const index = `${buildBody(indexExtraImports)}

${bootstrap}
`;

	// ── package.json ──────────────────────────────────────────────────────
	const dependencies: Record<string, string> = { "@yaebal/core": "latest" };
	for (const p of [...chosen, ...templatePlugins]) dependencies[p.dep] = "latest";
	if (deployOut.dependencies) Object.assign(dependencies, deployOut.dependencies);

	const pkg = {
		name: opts.name,
		version: "0.0.0",
		private: true,
		type: "module",
		scripts: SCRIPTS[opts.runtime],
		dependencies,
		devDependencies: { "@types/node": "latest", typescript: "^6.0.3" },
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
		include: deployTarget === "vercel" ? ["src", "api"] : ["src"],
	};

	const runCmd = runCommand(pm, "dev");
	const installCmd = installCommand(pm);
	const allPlugins = [...new Set([...chosen.map((p) => p.id), ...templateIds])];

	const envVarNames = ["BOT_TOKEN", ...(deployOut.envVars ?? [])];
	const envExample = `${envVarNames.map((n) => `${n}=`).join("\n")}\n`;

	const deployLine = deployTarget !== "none" ? ` · deploy: ${deployTarget}` : "";
	const ciLine = opts.ci ? " · ci: github actions" : "";

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
	}${deployLine}${ciLine}
`;

	const files: Record<string, string> = {
		"package.json": `${JSON.stringify(pkg, null, "\t")}\n`,
		"tsconfig.json": `${JSON.stringify(tsconfig, null, "\t")}\n`,
		"src/index.ts": index,
		".env.example": envExample,
		".gitignore": "node_modules\n.env\n*.log\n",
		"README.md": readme,
		...(spec.files ?? {}),
		...deployOut.files,
	};

	if (deployTarget === "vercel") {
		files["api/bot.ts"] = `${buildBody(['import { webhook } from "@yaebal/web";'])}

export const config = { runtime: "edge" };
export default webhook(bot, { secretToken: process.env.SECRET_TOKEN });
`;
	}

	if (opts.ci) files[".github/workflows/ci.yml"] = ciWorkflow(pm);

	return files;
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
/**
 * flush a rendered file map to `targetDir`, but atomically: everything is
 * written into a sibling temp directory first, then the whole thing is moved
 * into place with a single `rename`. a mid-write failure (disk full, a
 * permission error partway through) never leaves a half-written project on
 * disk for `existsSync(target)` to later mistake for a real, completed one.
 */
export async function writeProject(
	targetDir: string,
	files: Record<string, string>,
): Promise<void> {
	const staging = await mkdtemp(join(dirname(targetDir), ".create-yaebal-"));

	try {
		for (const [rel, content] of Object.entries(files)) {
			const full = join(staging, rel);
			await mkdir(dirname(full), { recursive: true });
			await writeFile(full, content);
		}

		try {
			await rename(staging, targetDir);
		} catch (err) {
			// EXDEV: staging and target are on different filesystems/devices —
			// rename can't work atomically there, so fall back to a plain copy.
			if ((err as { code?: string }).code !== "EXDEV") throw err;
			await mkdir(targetDir, { recursive: true });
			for (const [rel, content] of Object.entries(files)) {
				const full = join(targetDir, rel);
				await mkdir(dirname(full), { recursive: true });
				await writeFile(full, content);
			}
			await rm(staging, { recursive: true, force: true });
		}
	} catch (err) {
		await rm(staging, { recursive: true, force: true });
		throw err;
	}
}
