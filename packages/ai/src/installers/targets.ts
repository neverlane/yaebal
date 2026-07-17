import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { MCP_COMMAND, readSkills, rulesDigest, upsertSection } from "./content.js";

export interface InstallAction {
	/** `"write"` touched a file; `"note"` is a manual follow-up step to print. */
	kind: "write" | "note";
	detail: string;
}

export interface AgentTarget {
	id: string;
	label: string;
	/** true when the project shows traces of this agent — used to preselect. */
	detect(cwd: string): boolean;
	install(cwd: string): InstallAction[];
}

function write(cwd: string, relative: string, content: string): InstallAction {
	const path = join(cwd, relative);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
	return { kind: "write", detail: relative };
}

function readIfExists(cwd: string, relative: string): string | undefined {
	try {
		return readFileSync(join(cwd, relative), "utf8");
	} catch {
		return undefined;
	}
}

/** upsert the yaebal section into a markdown rules file. */
function writeSection(cwd: string, relative: string): InstallAction {
	return write(cwd, relative, upsertSection(readIfExists(cwd, relative), rulesDigest()));
}

/** merge `entry` into a json config at `path.to.key`, preserving everything else. */
function mergeJson(
	cwd: string,
	relative: string,
	keyPath: string[],
	entry: unknown,
): InstallAction {
	let root: Record<string, unknown> = {};
	const existing = readIfExists(cwd, relative);
	if (existing !== undefined) {
		try {
			root = JSON.parse(existing) as Record<string, unknown>;
		} catch {
			// unparseable config: keep it safe, refuse to clobber.
			return {
				kind: "note",
				detail: `${relative} exists but is not valid json — add the yaebal mcp server manually`,
			};
		}
	}

	let node = root;
	for (const key of keyPath) {
		const next = node[key];
		if (typeof next !== "object" || next === null) node[key] = {};
		node = node[key] as Record<string, unknown>;
	}
	node.yaebal = entry;

	return write(cwd, relative, `${JSON.stringify(root, null, "\t")}\n`);
}

export const AGENT_TARGETS: AgentTarget[] = [
	{
		id: "claude",
		label: "claude code (skills + .mcp.json)",
		detect: (cwd) => existsSync(join(cwd, ".claude")) || existsSync(join(cwd, "CLAUDE.md")),
		install(cwd) {
			const actions: InstallAction[] = [];
			for (const skill of readSkills()) {
				actions.push(write(cwd, join(".claude", "skills", skill.name, "SKILL.md"), skill.raw));
			}
			actions.push(mergeJson(cwd, ".mcp.json", ["mcpServers"], { ...MCP_COMMAND }));
			actions.push({
				kind: "note",
				detail:
					"alternative: `claude plugin marketplace add neverlane/yaebal` then `claude plugin install yaebal` gets skills + mcp as one managed plugin",
			});
			return actions;
		},
	},
	{
		id: "cursor",
		label: "cursor (.cursor/rules + mcp.json)",
		detect: (cwd) => existsSync(join(cwd, ".cursor")),
		install(cwd) {
			const frontmatter = `---\ndescription: yaebal telegram bot framework rules\nalwaysApply: true\n---\n\n`;
			return [
				write(cwd, join(".cursor", "rules", "yaebal.mdc"), frontmatter + rulesDigest()),
				mergeJson(cwd, join(".cursor", "mcp.json"), ["mcpServers"], { ...MCP_COMMAND }),
			];
		},
	},
	{
		id: "codex",
		label: "codex (AGENTS.md + config note)",
		detect: (cwd) => existsSync(join(cwd, ".codex")),
		install(cwd) {
			return [
				writeSection(cwd, "AGENTS.md"),
				{
					kind: "note",
					detail:
						'codex mcp is global — add to ~/.codex/config.toml:\n  [mcp_servers.yaebal]\n  command = "npx"\n  args = ["-y", "@yaebal/ai", "mcp"]',
				},
			];
		},
	},
	{
		id: "opencode",
		label: "opencode (AGENTS.md + opencode.json)",
		detect: (cwd) => existsSync(join(cwd, "opencode.json")) || existsSync(join(cwd, ".opencode")),
		install(cwd) {
			return [
				writeSection(cwd, "AGENTS.md"),
				mergeJson(cwd, "opencode.json", ["mcp"], {
					type: "local",
					command: [MCP_COMMAND.command, ...MCP_COMMAND.args],
					enabled: true,
				}),
			];
		},
	},
	{
		id: "copilot",
		label: "github copilot (instructions + .vscode/mcp.json)",
		detect: (cwd) => existsSync(join(cwd, ".github")),
		install(cwd) {
			return [
				writeSection(cwd, join(".github", "copilot-instructions.md")),
				mergeJson(cwd, join(".vscode", "mcp.json"), ["servers"], { ...MCP_COMMAND }),
			];
		},
	},
	{
		id: "windsurf",
		label: "windsurf (.windsurf/rules + mcp note)",
		detect: (cwd) => existsSync(join(cwd, ".windsurf")),
		install(cwd) {
			return [
				write(cwd, join(".windsurf", "rules", "yaebal.md"), rulesDigest()),
				{
					kind: "note",
					detail:
						'windsurf mcp is global — add the "yaebal" server (npx -y @yaebal/ai mcp) in windsurf settings → cascade → mcp',
				},
			];
		},
	},
	{
		id: "zed",
		label: "zed (.rules + settings note)",
		detect: (cwd) => existsSync(join(cwd, ".zed")) || existsSync(join(cwd, ".rules")),
		install(cwd) {
			return [
				writeSection(cwd, ".rules"),
				{
					kind: "note",
					detail:
						'zed mcp lives in settings — add under "context_servers": { "yaebal": { "command": { "path": "npx", "args": ["-y", "@yaebal/ai", "mcp"] } } }',
				},
			];
		},
	},
	{
		id: "gemini",
		label: "gemini cli (GEMINI.md + .gemini/settings.json)",
		detect: (cwd) => existsSync(join(cwd, ".gemini")) || existsSync(join(cwd, "GEMINI.md")),
		install(cwd) {
			return [
				writeSection(cwd, "GEMINI.md"),
				mergeJson(cwd, join(".gemini", "settings.json"), ["mcpServers"], { ...MCP_COMMAND }),
			];
		},
	},
	{
		id: "agents-md",
		label: "generic AGENTS.md (any other agent)",
		detect: (cwd) => existsSync(join(cwd, "AGENTS.md")),
		install(cwd) {
			return [writeSection(cwd, "AGENTS.md")];
		},
	},
];

export function installAgents(cwd: string, ids: string[]): Map<string, InstallAction[]> {
	const results = new Map<string, InstallAction[]>();
	for (const id of ids) {
		const target = AGENT_TARGETS.find((candidate) => candidate.id === id);
		if (target === undefined)
			throw new Error(
				`unknown agent "${id}" — known: ${AGENT_TARGETS.map((t) => t.id).join(", ")}`,
			);
		results.set(id, target.install(cwd));
	}
	return results;
}
