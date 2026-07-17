import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface SkillFile {
	/** directory slug, e.g. `"write-bot"`. */
	slug: string;
	/** frontmatter `name`, e.g. `"yaebal-write-bot"`. */
	name: string;
	/** frontmatter `description`. */
	description: string;
	/** the full SKILL.md, frontmatter included. */
	raw: string;
	/** the body without frontmatter. */
	body: string;
}

/** `skills/` ships at the package root; this file compiles to `lib/installers/`. */
const skillsDir = fileURLToPath(new URL("../../skills/", import.meta.url));

export function readSkills(): SkillFile[] {
	let entries: string[];
	try {
		entries = readdirSync(skillsDir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort();
	} catch {
		return [];
	}

	const skills: SkillFile[] = [];
	for (const slug of entries) {
		let raw: string;
		try {
			raw = readFileSync(`${skillsDir}${slug}/SKILL.md`, "utf8");
		} catch {
			continue;
		}
		const frontmatter = raw.match(/^---\n([\s\S]*?)\n---\n?/);
		const body =
			frontmatter === undefined || frontmatter === null ? raw : raw.slice(frontmatter[0].length);
		const field = (key: string): string =>
			frontmatter?.[1]?.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? "";
		skills.push({
			slug,
			name: field("name") || `yaebal-${slug}`,
			description: field("description"),
			raw,
			body: body.trim(),
		});
	}
	return skills;
}

export const MARKER_START = "<!-- yaebal:start -->";
export const MARKER_END = "<!-- yaebal:end -->";

/** insert or replace the yaebal-managed section of a rules file — re-runs stay idempotent. */
export function upsertSection(existing: string | undefined, section: string): string {
	const block = `${MARKER_START}\n${section.trim()}\n${MARKER_END}`;
	if (existing === undefined || existing.trim().length === 0) return `${block}\n`;

	const start = existing.indexOf(MARKER_START);
	const end = existing.indexOf(MARKER_END);
	if (start !== -1 && end !== -1 && end > start) {
		return `${existing.slice(0, start)}${block}${existing.slice(end + MARKER_END.length)}`;
	}
	return `${existing.trimEnd()}\n\n${block}\n`;
}

/**
 * the compact ruleset for single-file agents (AGENTS.md, cursor rules, copilot
 * instructions). full playbooks ship as claude skills; this is the distilled version.
 */
export function rulesDigest(): string {
	const skills = readSkills();
	const playbooks =
		skills.length === 0
			? ""
			: `\n## playbooks\n\nfull step-by-step playbooks (shipped as claude code skills, readable by anyone):\n${skills
					.map((skill) => `- ${skill.slug} — ${skill.description}`)
					.join("\n")}\n`;

	return `# yaebal — telegram bot framework rules

yaebal is a type-safe, esm-only telegram bot api framework. the context type *accumulates*
through the composer chain — plugins add typed properties, handlers see them with no casts.

## core rules

- use \`createBot()\` from \`"yaebal"\` for app code; \`@yaebal/core\` only for the minimal engine.
- install plugins with \`bot.install(plugin())\` — never \`use()\` for plugins. install order is
  type-checked: a plugin's dependencies must be installed before it.
- typed handlers come from filter queries: \`bot.on("message:text", (ctx) => ...)\`.
- \`derive()\` adds per-update (async ok) context; \`decorate()\` adds static values. anything
  added flows into every later handler's type.
- esm only: local imports use explicit \`.js\` extensions (\`import { x } from "./y.js"\`).
- never invent \`callback_data\` string formats — use \`@yaebal/callback-data\`'s \`callbackData()\`.
- never hit real telegram in tests — use \`@yaebal/test\` (\`createTestEnv\`, actors).
- before writing any bot api call, check the exact params: mcp tool \`get_api_method\`, or
  https://yaebal.mom/docs/api/.
- llm features (streamed replies, memory, limits) come from \`@yaebal/ai\` — don't hand-roll.

## mcp server

this project may have the "yaebal" mcp server configured (\`npx -y @yaebal/ai mcp\`). its tools:
\`get_api_method\` / \`get_api_type\` (exact bot api signatures), \`list_plugins\` /
\`get_plugin_doc\` (the ~35 plugin catalog), \`search_docs\`, \`get_example\` (30 runnable bots).
prefer these over guessing.

## docs

- index for llms: https://yaebal.mom/llms.txt (full: https://yaebal.mom/llms-full.txt)
- getting started: https://yaebal.mom/docs/getting-started/
- plugin catalog: https://yaebal.mom/docs/plugins/
- bot api reference: https://yaebal.mom/docs/api/
${playbooks}`;
}

/** the standard mcp server launch spec every agent config points at. */
export const MCP_COMMAND = { command: "npx", args: ["-y", "@yaebal/ai", "mcp"] } as const;
