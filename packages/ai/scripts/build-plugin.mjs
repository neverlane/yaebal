// generates the claude code plugin (packages/ai/claude-plugin/ + repo-root
// .claude-plugin/marketplace.json) from the skills sources — the marketplace distribution
// of what the installer writes locally.
// run from packages/ai: `node scripts/build-plugin.mjs` (part of `pnpm generate`).
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..", "..");
const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));

const pluginDir = join(packageRoot, "claude-plugin");
rmSync(pluginDir, { recursive: true, force: true });
mkdirSync(join(pluginDir, ".claude-plugin"), { recursive: true });

// plugin manifest — version tracks @yaebal/ai
writeFileSync(
	join(pluginDir, ".claude-plugin", "plugin.json"),
	`${JSON.stringify(
		{
			name: "yaebal",
			version: manifest.version,
			description:
				"telegram bot development with the yaebal framework: skills for bots, plugins, testing and deployment, plus an mcp server with the exact bot api schema.",
			author: { name: "neverlane", url: "https://github.com/neverlane" },
			homepage: "https://yaebal.mom",
			repository: "https://github.com/neverlane/yaebal",
			license: "MIT",
			keywords: ["telegram", "bot", "yaebal", "mcp"],
		},
		null,
		"\t",
	)}\n`,
);

// mcp server wiring — same launch spec as every installer target
writeFileSync(
	join(pluginDir, ".mcp.json"),
	`${JSON.stringify(
		{ mcpServers: { yaebal: { command: "npx", args: ["-y", "@yaebal/ai", "mcp"] } } },
		null,
		"\t",
	)}\n`,
);

// skills — copied verbatim, directory named after the frontmatter name
const skillsSource = join(packageRoot, "skills");
let count = 0;
for (const entry of readdirSync(skillsSource, { withFileTypes: true })) {
	if (!entry.isDirectory()) continue;
	const raw = readFileSync(join(skillsSource, entry.name, "SKILL.md"), "utf8");
	const name = raw.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? `yaebal-${entry.name}`;
	mkdirSync(join(pluginDir, "skills", name), { recursive: true });
	writeFileSync(join(pluginDir, "skills", name, "SKILL.md"), raw);
	count += 1;
}

writeFileSync(
	join(pluginDir, "README.md"),
	`# yaebal claude code plugin

generated from [\`packages/ai/skills\`](../skills) by \`packages/ai/scripts/build-plugin.mjs\` — do not edit by hand, regenerate with \`pnpm --filter @yaebal/ai generate\`.

install:

\`\`\`sh
claude plugin marketplace add neverlane/yaebal
claude plugin install yaebal
\`\`\`
`,
);

// marketplace manifest at the repo root
mkdirSync(join(repoRoot, ".claude-plugin"), { recursive: true });
writeFileSync(
	join(repoRoot, ".claude-plugin", "marketplace.json"),
	`${JSON.stringify(
		{
			name: "yaebal",
			owner: { name: "neverlane", url: "https://github.com/neverlane" },
			plugins: [
				{
					name: "yaebal",
					source: "./packages/ai/claude-plugin",
					description:
						"telegram bot development with yaebal: framework skills + an mcp server with the exact bot api schema, plugin catalog, docs search and runnable examples.",
				},
			],
		},
		null,
		"\t",
	)}\n`,
);

console.log(`claude plugin built: ${count} skills, marketplace manifest at .claude-plugin/`);
