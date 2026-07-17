import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
	type BotApiSchema,
	loadCorpus,
	loadExamples,
	loadPlugins,
	loadSchema,
	searchCorpus,
} from "./data.js";
import { formatMethod, formatObject } from "./format.js";

export * from "./data.js";
export { formatMethod, formatObject, typeName } from "./format.js";

const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });

function closest(name: string, names: string[], limit = 5): string[] {
	const needle = name.toLowerCase();
	return names.filter((candidate) => candidate.toLowerCase().includes(needle)).slice(0, limit);
}

/**
 * the yaebal mcp server: exact bot api schema lookups (the antidote to hallucinated
 * params), plugin catalog, docs search and runnable examples. run it over stdio with
 * `npx -y @yaebal/ai mcp`.
 */
export function createYaebalMcpServer(): McpServer {
	const schema: BotApiSchema = loadSchema();
	const version = `${schema.version.major}.${schema.version.minor}.${schema.version.patch}`;

	const server = new McpServer({ name: "yaebal", version });

	server.registerTool(
		"get_api_method",
		{
			title: "get bot api method",
			description:
				`exact signature of a telegram bot api method (bot api ${version}): parameters, types, ` +
				"which are required, return type. always check here before writing an api call.",
			inputSchema: { name: z.string().describe('method name, e.g. "sendMessage"') },
		},
		async ({ name }) => {
			const method = schema.methods.find((m) => m.name.toLowerCase() === name.toLowerCase());
			if (method !== undefined) return text(formatMethod(method));
			const suggestions = closest(
				name,
				schema.methods.map((m) => m.name),
			);
			return text(
				`no method "${name}" in bot api ${version}.` +
					(suggestions.length > 0 ? ` did you mean: ${suggestions.join(", ")}?` : ""),
			);
		},
	);

	server.registerTool(
		"get_api_type",
		{
			title: "get bot api type",
			description:
				`exact shape of a telegram bot api object (bot api ${version}): fields, types, ` +
				'which are required. e.g. "Message", "InlineKeyboardMarkup".',
			inputSchema: { name: z.string().describe('type name, e.g. "Message"') },
		},
		async ({ name }) => {
			const object = schema.objects.find((o) => o.name.toLowerCase() === name.toLowerCase());
			if (object !== undefined) return text(formatObject(object));
			const suggestions = closest(
				name,
				schema.objects.map((o) => o.name),
			);
			return text(
				`no type "${name}" in bot api ${version}.` +
					(suggestions.length > 0 ? ` did you mean: ${suggestions.join(", ")}?` : ""),
			);
		},
	);

	server.registerTool(
		"list_plugins",
		{
			title: "list yaebal plugins",
			description:
				"the full @yaebal/* plugin catalog with one-line descriptions — check here before " +
				"writing something a plugin already does.",
			inputSchema: {},
		},
		async () => {
			const rows = loadPlugins().map((p) => `- **${p.package}** — ${p.description}`);
			return text(rows.join("\n"));
		},
	);

	server.registerTool(
		"get_plugin_doc",
		{
			title: "get yaebal plugin doc",
			description:
				'full readme of a @yaebal/* package: usage, options, what lands on ctx. e.g. "session", "keyboard", "ai".',
			inputSchema: {
				name: z.string().describe('plugin name, e.g. "session" or "@yaebal/session"'),
			},
		},
		async ({ name }) => {
			const plugins = loadPlugins();
			const slug = name.replace(/^@yaebal\//, "").toLowerCase();
			const plugin = plugins.find((p) => p.name === slug);
			if (plugin === undefined) {
				return text(`no plugin "${name}". available: ${plugins.map((p) => p.name).join(", ")}`);
			}
			const header = plugin.docs === undefined ? "" : `docs page: ${plugin.docs}\n\n`;
			return text(header + plugin.readme);
		},
	);

	server.registerTool(
		"search_docs",
		{
			title: "search yaebal docs",
			description:
				"full-text search over the yaebal docs, plugin readmes and agent playbooks. " +
				"use for concepts: context type flow, filter queries, testing, deployment.",
			inputSchema: { query: z.string().describe("what you're looking for") },
		},
		async ({ query }) => {
			const hits = searchCorpus(loadCorpus(), query);
			if (hits.length === 0) return text(`nothing found for "${query}".`);
			return text(
				hits
					.map(
						(hit) =>
							`## ${hit.title}${hit.url === undefined ? "" : ` — ${hit.url}`}\n${hit.snippet}`,
					)
					.join("\n\n"),
			);
		},
	);

	server.registerTool(
		"get_example",
		{
			title: "get yaebal example bot",
			description:
				"complete runnable example bots from the yaebal repo. call without a name to list " +
				'all 25+, or with one (e.g. "keyboard", "session") for full source.',
			inputSchema: { name: z.string().optional().describe("example name; omit to list all") },
		},
		async ({ name }) => {
			const examples = loadExamples();
			if (name === undefined) {
				return text(examples.map((e) => `- **${e.name}** — ${e.description}`).join("\n"));
			}
			const example = examples.find((e) => e.name === name.toLowerCase());
			if (example === undefined) {
				return text(`no example "${name}". available: ${examples.map((e) => e.name).join(", ")}`);
			}
			return text(
				`# ${example.name}\n${example.description}\n\n\`\`\`ts\n${example.source}\n\`\`\``,
			);
		},
	);

	return server;
}

/** run the server over stdio — what `yaebal-ai mcp` and `.mcp.json` entries execute. */
export async function runMcpStdio(): Promise<void> {
	const server = createYaebalMcpServer();
	await server.connect(new StdioServerTransport());
}
