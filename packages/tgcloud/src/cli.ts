#!/usr/bin/env node
import { bundleTgcloud } from "./bundle.js";

/**
 * `yaebal-tgcloud <entry> [--root dir] [--export name] [--handler type]...`
 *
 * writes `tgcloud/handlers/*.js` next to a bot so `npx tgcloud push` can deploy
 * them. the bot's own dev dependencies stay on the machine that builds — the
 * serverless runtime never sees them.
 */
const args = process.argv.slice(2);

function flag(name: string): string | undefined {
	const index = args.indexOf(name);
	if (index === -1) return undefined;
	const value = args[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`${name} needs a value`);
	}
	return value;
}

function list(name: string): string[] {
	const out: string[] = [];
	for (let i = 0; i < args.length; i++) {
		if (args[i] !== name) continue;
		const value = args[i + 1];
		if (!value || value.startsWith("--")) throw new Error(`${name} needs a value`);
		out.push(value);
	}
	return out;
}

const input = args.find((arg, index) => {
	const previous = args[index - 1];
	return !arg.startsWith("--") && !(previous?.startsWith("--") && previous !== "--keep-logs");
});
if (!input || args.includes("--help") || args.includes("-h")) {
	console.log(
		"usage: yaebal-tgcloud <bot-entry> [--root dir] [--export name] [--handler type] [--ignore type]",
	);
	process.exit(input ? 0 : 1);
}

const result = await bundleTgcloud({
	input: { path: input, export: flag("--export") },
	root: flag("--root"),
	handlers: list("--handler"),
	ignore: list("--ignore"),
	keepLogs: args.includes("--keep-logs"),
});

console.log(`wrote ${result.handlers.length} handler(s) to ${result.dir}`);
for (const file of result.handlers) console.log(`  ${file}`);
for (const file of result.removed) console.log(`  removed ${file}`);
