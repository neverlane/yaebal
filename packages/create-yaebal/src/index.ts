/**
 * create-yaebal — scaffold a type-safe telegram bot.
 *
 * three front-ends, one pipeline:
 *   flags (`--yes`) → no prompts · plain readline → fallback · ansi wizard → the
 *   hype. all of them produce a `Selections`, which `renderFiles` + `writeProject`
 *   turn into a working project.
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import process from "node:process";
import { HELP, parseArgs } from "./args.js";
import { defaults, type Selections, sanitizePlugins } from "./config.js";
import { runPrompts } from "./prompts.js";
import { installCommand, renderFiles, runCommand, writeProject } from "./scaffold.js";
import { gitInit, installDeps, isInteractive, supportsTui, validateProjectName } from "./util.js";

export type { ParsedArgs } from "./args.js";
export { parseArgs } from "./args.js";
// re-exports so the package is usable as a library / from tests ---------------
export * from "./catalog.js";
export * from "./config.js";
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
	const args = parseArgs(argv);

	if (args.help) {
		console.log(HELP);
		return;
	}

	if (args.version) {
		console.log(version());
		return;
	}

	for (const u of args.unknown) console.error(c.dim(`warning: ignoring unknown argument "${u}"`));

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

	const target = resolve(process.cwd(), selections.name);
	if (existsSync(target)) {
		console.error(c.red(`✗ directory "${selections.name}" already exists`));
		process.exitCode = 1;

		return;
	}

	const files = renderFiles(selections);
	await writeProject(target, files);

	console.log(c.green(`\n✓ created ${selections.name}/`));

	if (selections.git) {
		const ok = await gitInit(target);
		console.log(
			ok ? c.dim("  • initialised git repository") : c.dim("  • skipped git (not available)"),
		);
	}

	if (selections.install) {
		console.log(c.dim(`  • installing dependencies with ${selections.packageManager}…`));

		const ok = await installDeps(selections.packageManager, target);
		if (!ok) console.log(c.red("  • install failed — run it manually"));
	}

	// next steps -----------------------------------------------------------------
	const steps: string[] = [`cd ${selections.name}`];
	if (!selections.install) steps.push(installCommand(selections.packageManager));

	steps.push(c.dim("# add your BOT_TOKEN to .env"));
	steps.push(runCommand(selections.packageManager, "dev"));

	console.log(`\n${c.bold("next steps:")}`);

	for (const s of steps) console.log(`  ${s}`);

	console.log(`\n${c.cyan("happy hacking ✦")}\n`);
}
