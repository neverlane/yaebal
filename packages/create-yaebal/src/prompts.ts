/**
 * the plain, dependency-free wizard used when the rich tui can't run (no tty,
 * `--no-tui`, or a dumb terminal). it's deliberately
 * close to create-gramio's minimal flow: one question per line, sane defaults
 * in brackets, enter to accept.
 */

import process from "node:process";
import { createInterface } from "node:readline/promises";
import type { ParsedArgs } from "./args.js";
import {
	type Choice,
	DEPLOYS,
	PACKAGE_MANAGERS,
	type PackageManager,
	PLUGINS,
	RUNTIMES,
	type Runtime,
	TEMPLATES,
	type TemplateId,
} from "./catalog.js";
import { defaults, type Selections, sanitizePlugins } from "./config.js";
import { validateProjectName } from "./util.js";

const c = {
	dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
	cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
	green: (s: string) => `\x1b[32m${s}\x1b[0m`,
	bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

type RL = ReturnType<typeof createInterface>;

async function pickOne<T extends string>(
	rl: RL,
	question: string,
	choices: Choice<T>[],
	fallback: T,
): Promise<T> {
	console.log(`\n${c.bold(question)}`);

	choices.forEach((ch, i) => {
		const mark = ch.value === fallback ? c.green("›") : " ";
		console.log(`  ${mark} ${i + 1}. ${ch.label} ${c.dim(`— ${ch.hint}`)}`);
	});

	const def = choices.findIndex((ch) => ch.value === fallback) + 1;
	const ans = (await rl.question(c.dim(`  choose 1-${choices.length} [${def}]: `))).trim();

	if (!ans) return fallback;
	const idx = Number.parseInt(ans, 10) - 1;

	return choices[idx]?.value ?? fallback;
}

export async function runPrompts(args: ParsedArgs): Promise<Selections | undefined> {
	const d = defaults(args);
	const rl = createInterface({ input: process.stdin, output: process.stdout });

	try {
		console.log(c.cyan("\n  ✦ create-yaebal — let's scaffold a bot\n"));

		let name = args.name;
		while (name === undefined) {
			const ans = (await rl.question(`${c.bold("project name")} ${c.dim(`[${d.name}]: `)}`)).trim();
			const candidate = ans || d.name;
			const err = validateProjectName(candidate);

			if (err) {
				console.log(c.dim(`  ✗ ${err}`));
				continue;
			}

			name = candidate;
		}

		// template is asked before runtime/pm so the plugin path (which needs
		// neither a runtime question nor a deploy target) can skip them cleanly.
		const template: TemplateId =
			args.template ?? (await pickOne(rl, "template", TEMPLATES, d.template));
		const isPlugin = template === "plugin";

		const runtime: Runtime = isPlugin
			? d.runtime
			: (args.runtime ?? (await pickOne(rl, "runtime", RUNTIMES, d.runtime)));

		const packageManager: PackageManager =
			args.packageManager ??
			(await pickOne(rl, "package manager", PACKAGE_MANAGERS, d.packageManager));

		let plugins = args.plugins;
		if (isPlugin) {
			plugins = [];
		} else if (plugins === undefined) {
			console.log(`\n${c.bold("plugins")} ${c.dim("(space/comma separated ids, or 'all')")}`);

			PLUGINS.forEach((p) => {
				const star = p.recommended ? c.green(" ★") : "";
				console.log(`  ${p.id}${star} ${c.dim(`— ${p.hint}`)}`);
			});

			const def = d.plugins.join(", ");
			const ans = (await rl.question(c.dim(`  plugins [${def}]: `))).trim();

			if (!ans) plugins = d.plugins;
			else if (ans.toLowerCase() === "all") plugins = PLUGINS.map((p) => p.id);
			else if (ans.toLowerCase() === "none") plugins = [];
			else plugins = ans.split(/[\s,]+/).filter(Boolean);
		}

		plugins = sanitizePlugins(plugins);

		const deploy = isPlugin
			? "none"
			: (args.deploy ?? (await pickOne(rl, "deploy target", DEPLOYS, d.deploy)));

		const ci = isPlugin
			? false
			: (args.ci ?? (await confirm(rl, "add a github actions ci workflow?", d.ci)));

		const git = args.git ?? (await confirm(rl, "initialise a git repository?", d.git));

		const install = args.install ?? (await confirm(rl, "install dependencies now?", d.install));

		return { name, runtime, packageManager, template, plugins, deploy, ci, git, install };
	} catch (err) {
		// ctrl+c during a question rejects with an AbortError — treat as cancel.
		if (
			err instanceof Error &&
			(err.name === "AbortError" || (err as { code?: string }).code === "ABORT_ERR")
		) {
			return undefined;
		}
		throw err;
	} finally {
		rl.close();
	}
}

async function confirm(rl: RL, question: string, fallback: boolean): Promise<boolean> {
	const def = fallback ? "Y/n" : "y/N";
	const ans = (await rl.question(`\n${c.bold(question)} ${c.dim(`[${def}]: `)}`))
		.trim()
		.toLowerCase();

	if (!ans) return fallback;
	return ans === "y" || ans === "yes";
}
