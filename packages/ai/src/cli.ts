#!/usr/bin/env node
// yaebal-ai — mcp server + agent installer. `npx @yaebal/ai` runs the installer.

const HELP = `yaebal-ai — ai tooling for the yaebal telegram bot framework

usage:
  npx @yaebal/ai [install]              interactive installer (picks up your agents)
  npx @yaebal/ai install --agents a,b   non-interactive, e.g. --agents claude,cursor
  npx @yaebal/ai mcp                    run the yaebal mcp server over stdio
  npx @yaebal/ai --help

agents: claude, cursor, codex, opencode, copilot, windsurf, zed, gemini, agents-md
`;

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const command = argv[0] ?? "install";

	if (command === "--help" || command === "-h" || command === "help") {
		process.stdout.write(HELP);
		return;
	}

	if (command === "mcp") {
		const { runMcpStdio } = await import("./mcp/index.js");
		await runMcpStdio();
		return;
	}

	if (command !== "install") {
		process.stderr.write(`unknown command "${command}"\n\n${HELP}`);
		process.exitCode = 1;
		return;
	}

	const { AGENT_TARGETS, installAgents } = await import("./installers/targets.js");
	const { color, multiSelect } = await import("./installers/tui.js");
	const cwd = process.cwd();

	const flagIndex = argv.indexOf("--agents");
	let ids: string[];
	if (flagIndex !== -1) {
		ids = (argv[flagIndex + 1] ?? "")
			.split(",")
			.map((id) => id.trim())
			.filter((id) => id.length > 0);
		if (ids.length === 0) {
			process.stderr.write("--agents needs a comma-separated list, e.g. --agents claude,cursor\n");
			process.exitCode = 1;
			return;
		}
	} else {
		const detected = new Set(AGENT_TARGETS.filter((t) => t.detect(cwd)).map((t) => t.id));
		if (detected.size === 0) detected.add("claude").add("agents-md");
		process.stdout.write(
			`\n${color.bold("yaebal ai setup")} ${color.dim("— rules + mcp server for your coding agents")}\n\n`,
		);
		const picked = await multiSelect(
			"which agents should know yaebal?",
			AGENT_TARGETS.map((target) => ({
				value: target.id,
				label: target.label,
				hint: detected.has(target.id) ? "(detected)" : undefined,
				selected: detected.has(target.id),
			})),
		);
		if (picked === undefined || picked.length === 0) {
			process.stdout.write(`${color.dim("nothing selected — bye.")}\n`);
			return;
		}
		ids = picked;
	}

	const results = installAgents(cwd, ids);
	const notes: string[] = [];
	process.stdout.write("\n");
	for (const [id, actions] of results) {
		const files = actions.filter((action) => action.kind === "write");
		process.stdout.write(`${color.green("✔")} ${color.bold(id)}\n`);
		for (const action of files) process.stdout.write(`  ${color.dim("wrote")} ${action.detail}\n`);
		for (const action of actions) if (action.kind === "note") notes.push(action.detail);
	}
	if (notes.length > 0) {
		process.stdout.write(`\n${color.yellow("manual steps:")}\n`);
		for (const note of notes) process.stdout.write(`  • ${note}\n`);
	}
	process.stdout.write(
		`\n${color.dim("docs:")} https://yaebal.mom/docs/llms/ ${color.dim("· mcp check:")} npx @yaebal/ai mcp\n`,
	);
}

main().catch((error: unknown) => {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
});
