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
}

interface Scripts {
	dev: string;
	start: string;
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

const TEMPLATES: Record<TemplateId, TemplateSpec> = {
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
		body: `bot.command("start", (ctx) => ctx.reply("hello! i'm a yaebal bot 🤖"));
bot.command("help", (ctx) => ctx.reply("commands: /start /help /ping"));
bot.command("ping", (ctx) => ctx.reply("pong 🏓"));
bot.on("message:text", (ctx) => ctx.reply(\`you said: \${ctx.text}\`));`,
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
};

/** default package manager that matches a runtime when the user didn't pick one */
export function defaultPackageManager(runtime: Runtime): PackageManager {
	if (runtime === "bun") return "bun";
	if (runtime === "deno") return "deno";
	return "pnpm";
}

const pkgOf = (importLine: string): string | undefined => importLine.match(/from "([^"]+)"/)?.[1];

/** turn options into a `relative path → file content` map. pure. */
export function renderFiles(opts: ScaffoldOptions): Record<string, string> {
	const templateId = opts.template ?? "minimal";
	const spec = TEMPLATES[templateId];
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
