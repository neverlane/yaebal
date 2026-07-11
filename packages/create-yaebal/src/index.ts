/**
 * create-yaebal — scaffold a type-safe telegram bot.
 *
 * three front-ends, one pipeline:
 *   flags (`--yes`) → no prompts · plain readline → fallback · ansi wizard → the
 *   hype. all of them produce a `Selections`, which `renderFiles` + `writeProject`
 *   turn into a working project. a `create-yaebal.json` (or a `"create-yaebal"`
 *   key in `package.json`) can pre-fill any of it — cli flags still always win.
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import process from "node:process";
import { HELP, parseArgs } from "./args.js";
import { defaults, type Selections, sanitizePlugins } from "./config.js";
import { applyConfigFile, loadConfigFile } from "./config-file.js";
import { runPrompts } from "./prompts.js";
import {
	installCommand,
	nodePackageManager,
	renderFiles,
	runCommand,
	scriptCommand,
	writeProject,
} from "./scaffold.js";
import {
	gitInit,
	installDeps,
	isInteractive,
	projectDirName,
	supportsTui,
	validateProjectName,
} from "./util.js";

export type { ParsedArgs } from "./args.js";
export { parseArgs } from "./args.js";
// re-exports so the package is usable as a library / from tests ---------------
export * from "./catalog.js";
export * from "./config.js";
export * from "./config-file.js";
export * from "./scaffold.js";

const c = {
	cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
	green: (s: string) => `\x1b[32m${s}\x1b[0m`,
	dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
	bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
	red: (s: string) => `\x1b[31m${s}\x1b[0m`,
};

function version(): string {
	try {
		const require = createRequire(import.meta.url);

		return (require("../package.json") as { version: string }).version;
	} catch {
		return "0.0.0";
	}
}

/** decide and run the front-end that gathers the user's choices. */
async function gather(args: ReturnType<typeof parseArgs>): Promise<Selections | undefined> {
	// fully non-interactive: take defaults, no questions asked.
	if (args.yes) {
		const d = defaults(args);
		return { ...d, plugins: sanitizePlugins(d.plugins) };
	}

	// no tty (piped/CI) and not --yes: we can't prompt. accept defaults if we
	// at least have a name, otherwise tell the user how to proceed.
	if (!isInteractive()) {
		if (args.name) {
			const d = defaults(args);
			return { ...d, plugins: sanitizePlugins(d.plugins) };
		}

		console.error(
			c.red("✗ no interactive terminal."),
			"pass a name and flags, e.g. `create-yaebal my-bot --yes`.",
		);

		process.exitCode = 1;
		return undefined;
	}

	const wantTui = args.tui === true || (args.tui !== false && supportsTui());
	if (wantTui) {
		try {
			const { runTui } = await import("./tui/app.js");
			return await runTui(args);
		} catch (err) {
			if (process.env.YAEBAL_DEBUG) console.error(c.dim(`tui unavailable: ${String(err)}`));
			// fall through to plain prompts
		}
	}

	return runPrompts(args);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
	let args = parseArgs(argv);

	if (args.help) {
		console.log(HELP);
		return;
	}

	if (args.version) {
		console.log(version());
		return;
	}

	const config = loadConfigFile(process.cwd(), args.configPath, args.noConfig ?? false);
	if (config.source) console.error(c.dim(`• reading defaults from ${config.source}`));
	for (const w of config.warnings) console.error(c.dim(`warning: ${w}`));
	args = applyConfigFile(args, config.values);

	for (const u of args.unknown) console.error(c.dim(`warning: ignoring unknown argument "${u}"`));
	for (const w of args.warnings) console.error(c.dim(`warning: ${w}`));

	const selections = await gather(args);
	if (!selections) {
		if (process.exitCode !== 1) console.log(c.dim("\n✗ cancelled — nothing was created."));
		return;
	}

	const nameError = validateProjectName(selections.name);
	if (nameError) {
		console.error(c.red(`✗ ${nameError}`));
		process.exitCode = 1;

		return;
	}

	// a scoped package name (`@org/my-plugin`) still lives in an unscoped folder.
	const dirName = projectDirName(selections.name);
	const target = resolve(process.cwd(), dirName);
	if (existsSync(target)) {
		console.error(c.red(`✗ directory "${dirName}" already exists`));
		process.exitCode = 1;

		return;
	}

	const files = renderFiles(selections);
	await writeProject(target, files);

	// --json prints one machine-readable summary instead of the ansi narration;
	// warnings above still went to stderr, so piping stdout stays clean either way.
	const log = (msg: string): void => {
		if (!args.json) console.log(msg);
	};

	log(c.green(`\n✓ created ${dirName}/`));

	let gitOk = false;
	if (selections.git) {
		gitOk = await gitInit(target);
		log(gitOk ? c.dim("  • initialised git repository") : c.dim("  • skipped git (not available)"));
	}

	const isPlugin = selections.template === "plugin";
	const installPackageManager = isPlugin
		? nodePackageManager(selections.packageManager)
		: selections.packageManager;

	// plugin packages are always npm-tooled (they build+publish with tsc), so a
	// bun/deno pick there gets silently remapped — say so instead of just doing it.
	if (isPlugin && installPackageManager !== selections.packageManager) {
		log(
			c.dim(
				`  • plugin packages use npm-style tooling — using ${installPackageManager} instead of ${selections.packageManager}`,
			),
		);
	}

	let installOk = false;
	if (selections.install) {
		log(c.dim(`  • installing dependencies with ${installPackageManager}…`));

		installOk = await installDeps(installPackageManager, target);
		if (!installOk) log(c.red("  • install failed — run it manually"));
	}

	// next steps -----------------------------------------------------------------
	const steps: string[] = [`cd ${dirName}`];
	if (!selections.install) steps.push(installCommand(installPackageManager));

	if (isPlugin) {
		steps.push(scriptCommand(installPackageManager, "typecheck"));
		steps.push(scriptCommand(installPackageManager, "test"));
		steps.push(c.dim("# optional: export BOT_TOKEN to run examples/basic.mjs"));
		steps.push(scriptCommand(installPackageManager, "example"));
	} else {
		steps.push(c.dim("# add your BOT_TOKEN to .env"));
		steps.push(runCommand(selections.packageManager, "dev"));
	}

	if (args.json) {
		console.log(
			JSON.stringify(
				{
					name: selections.name,
					path: target,
					template: selections.template,
					runtime: selections.runtime,
					packageManager: installPackageManager,
					plugins: selections.plugins,
					deploy: selections.deploy,
					ci: selections.ci,
					git: selections.git ? gitOk : false,
					install: selections.install ? installOk : false,
					files: Object.keys(files),
				},
				null,
				2,
			),
		);
		return;
	}

	console.log(`\n${c.bold("next steps:")}`);

	for (const s of steps) console.log(`  ${s}`);

	console.log(`\n${c.cyan("happy hacking ✦")}\n`);
}
