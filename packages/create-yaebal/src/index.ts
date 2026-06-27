import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";

export type Runtime = "node" | "bun" | "deno";

interface PluginDef {
	dep: string;
	import: string;
	install?: string;
	setup?: string;
}

const CATALOG: Record<string, PluginDef> = {
	session: {
		dep: "@yaebal/session",
		import: 'import { session } from "@yaebal/session";',
		install: "session({ initial: () => ({ seen: 0 }) })",
	},
	ratelimiter: {
		dep: "@yaebal/ratelimiter",
		import: 'import { ratelimiter } from "@yaebal/ratelimiter";',
		install: "ratelimiter()",
	},
	again: {
		dep: "@yaebal/again",
		import: 'import { autoRetry } from "@yaebal/again";',
		setup: "autoRetry(bot.api);",
	},
};

export interface ScaffoldOptions {
	name: string;
	runtime: Runtime;
	plugins: string[];
}

const SCRIPTS: Record<Runtime, { dev: string; start: string }> = {
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

/** Pure: turn options into a map of relative path → file content. */
export function renderFiles(opts: ScaffoldOptions): Record<string, string> {
	const chosen = opts.plugins.filter((p) => p in CATALOG);

	const imports = [
		'import { Bot } from "@yaebal/core";',
		...chosen.map((p) => CATALOG[p]?.import ?? ""),
	]
		.filter(Boolean)
		.join("\n");
	const installs = chosen.map((p) => CATALOG[p]?.install).filter((x): x is string => Boolean(x));
	const setups = chosen.map((p) => CATALOG[p]?.setup).filter((x): x is string => Boolean(x));

	const botDecl = installs.length
		? `const bot = new Bot(process.env.BOT_TOKEN ?? "")\n${installs.map((s) => `\t.install(${s})`).join("\n")};`
		: `const bot = new Bot(process.env.BOT_TOKEN ?? "");`;

	const index = `${imports}\n\n${botDecl}\n${setups.length ? `\n${setups.join("\n")}\n` : ""}
bot.command("start", (ctx) => ctx.reply("hello from yaebal 👋"));

bot.on("message:text", (ctx) => ctx.reply(ctx.text));

bot.start();
console.log("bot running");
`;

	const deps: Record<string, string> = { "@yaebal/core": "latest" };
	for (const p of chosen) {
		const dep = CATALOG[p]?.dep;
		if (dep) deps[dep] = "latest";
	}

	const pkg = {
		name: opts.name,
		version: "0.0.0",
		private: true,
		type: "module",
		scripts: SCRIPTS[opts.runtime],
		dependencies: deps,
		devDependencies: { "@types/node": "^22.0.0", typescript: "^5.7.0" },
	};

	const tsconfig = {
		compilerOptions: {
			target: "ES2022",
			module: "NodeNext",
			moduleResolution: "NodeNext",
			strict: true,
			noUncheckedIndexedAccess: true,
			verbatimModuleSyntax: true,
			skipLibCheck: true,
			outDir: "lib",
		},
		include: ["src"],
	};

	return {
		"package.json": `${JSON.stringify(pkg, null, 2)}\n`,
		"tsconfig.json": `${JSON.stringify(tsconfig, null, 2)}\n`,
		"src/index.ts": index,
		".env.example": "BOT_TOKEN=\n",
		".gitignore": "node_modules\nlib\n.env\n",
		"README.md": `# ${opts.name}\n\na telegram bot built with [yaebal](https://github.com/neverlane/yaebal).\n\n\`\`\`sh\n# 1. put your token in .env\ncp .env.example .env\n\n# 2. run\n${opts.runtime === "deno" ? SCRIPTS.deno.dev : "pnpm dev"}\n\`\`\`\n`,
	};
}

const isRuntime = (v: string): v is Runtime => v === "node" || v === "bun" || v === "deno";

interface Args {
	name?: string;
	runtime?: string;
	plugins?: string;
}

/** Pure: parse argv into name + flags. Supports `<name> --runtime x --plugins a,b`. */
export function parseArgs(argv: string[]): Args {
	const out: Args = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--runtime" || a === "-r") out.runtime = argv[++i];
		else if (a === "--plugins" || a === "-p") out.plugins = argv[++i];
		else if (a && !a.startsWith("-") && out.name === undefined) out.name = a;
	}
	return out;
}

export async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const tty = Boolean(process.stdin.isTTY);
	const rl = tty ? createInterface({ input: process.stdin, output: process.stdout }) : null;
	try {
		let name = args.name;
		if (!name && rl) name = (await rl.question("project name: ")).trim();
		if (!name) {
			console.error(
				"✗ project name is required\n  usage: create-yaebal <name> [--runtime node|bun|deno] [--plugins session,again]",
			);
			process.exitCode = 1;
			return;
		}

		let runtime: Runtime = "node";
		if (args.runtime && isRuntime(args.runtime)) runtime = args.runtime;
		else if (rl) {
			const a = (await rl.question("runtime — node / bun / deno [node]: ")).trim().toLowerCase();
			if (isRuntime(a)) runtime = a;
		}

		let pluginsRaw = args.plugins ?? "";
		if (args.plugins === undefined && rl) {
			pluginsRaw = await rl.question(
				"plugins — comma list of [session, ratelimiter, again] (enter to skip): ",
			);
		}
		const plugins = pluginsRaw
			.split(",")
			.map((s) => s.trim())
			.filter((p) => p in CATALOG);

		const target = resolve(process.cwd(), name);
		if (existsSync(target)) {
			console.error(`✗ directory "${name}" already exists`);
			process.exitCode = 1;
			return;
		}

		const files = renderFiles({ name, runtime, plugins });
		for (const [rel, content] of Object.entries(files)) {
			const full = join(target, rel);
			await mkdir(dirname(full), { recursive: true });
			await writeFile(full, content);
		}

		const installCmd = runtime === "deno" ? "deno cache src/index.ts" : "pnpm install";
		const runCmd = runtime === "deno" ? SCRIPTS.deno.dev : "pnpm dev";
		console.log(
			`\n✓ created ${name}/\n\nnext steps:\n  cd ${name}\n  ${installCmd}\n  # add your BOT_TOKEN to .env\n  ${runCmd}\n`,
		);
	} finally {
		rl?.close();
	}
}
