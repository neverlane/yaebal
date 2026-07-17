import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

/** the slice of `@yaebal/types/schema.json` the mcp tools read. */
export interface ApiArgument {
	name: string;
	description: string;
	required: boolean;
	type: string;
	[extra: string]: unknown;
}

export interface ApiMethod {
	name: string;
	description: string;
	arguments?: ApiArgument[];
	return_type?: unknown;
	category?: string;
	documentation_link?: string;
}

export interface ApiProperty {
	name: string;
	description: string;
	required?: boolean;
	type: string;
	[extra: string]: unknown;
}

export interface ApiObject {
	name: string;
	description: string;
	category?: string;
	documentation_link?: string;
	type?: string;
	properties?: ApiProperty[];
	any_of?: unknown[];
}

export interface BotApiSchema {
	version: { major: number; minor: number; patch: number };
	methods: ApiMethod[];
	objects: ApiObject[];
}

export interface PluginEntry {
	/** short name, e.g. `"session"`. */
	name: string;
	/** npm package name, e.g. `"@yaebal/session"`. */
	package: string;
	description: string;
	/** docs page, when the plugin has one. */
	docs?: string;
	/** the package readme, verbatim. */
	readme: string;
}

export interface ExampleEntry {
	name: string;
	description: string;
	/** the example's entry source, verbatim. */
	source: string;
}

export interface DocSection {
	title: string;
	url?: string;
	text: string;
}

const require = createRequire(import.meta.url);

export function loadSchema(): BotApiSchema {
	return require("@yaebal/types/schema.json") as BotApiSchema;
}

/** `data/` lives at the package root; this file compiles to `lib/mcp/`. */
const dataDir = fileURLToPath(new URL("../../data/", import.meta.url));
const skillsDir = fileURLToPath(new URL("../../skills/", import.meta.url));

function loadJson<T>(file: string): T {
	return JSON.parse(readFileSync(new URL(file, `file://${dataDir}`), "utf8")) as T;
}

export const loadPlugins = (): PluginEntry[] => loadJson<PluginEntry[]>("plugins.json");
export const loadExamples = (): ExampleEntry[] => loadJson<ExampleEntry[]>("examples.json");

/** the search corpus: docs digest + plugin readmes + the shipped skills. */
export function loadCorpus(): DocSection[] {
	const sections = loadJson<DocSection[]>("docs.json");
	for (const plugin of loadPlugins()) {
		sections.push({
			title: `${plugin.package} readme`,
			url: plugin.docs,
			text: plugin.readme,
		});
	}
	try {
		for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const text = readFileSync(`${skillsDir}${entry.name}/SKILL.md`, "utf8");
			sections.push({ title: `skill: ${entry.name}`, text });
		}
	} catch {
		// skills are optional at runtime — the corpus works without them.
	}
	return sections;
}

const tokenize = (text: string): string[] =>
	text
		.toLowerCase()
		.split(/[^a-z0-9а-яё_]+/i)
		.filter((token) => token.length > 1);

export interface SearchHit {
	title: string;
	url?: string | undefined;
	snippet: string;
	score: number;
}

/**
 * rank corpus sections for a query: term frequency with a title boost, snippet centered
 * on the densest paragraph. deliberately simple — the corpus is small and curated.
 */
export function searchCorpus(corpus: DocSection[], query: string, limit = 5): SearchHit[] {
	const terms = [...new Set(tokenize(query))];
	if (terms.length === 0) return [];

	const hits: SearchHit[] = [];
	for (const section of corpus) {
		const titleTokens = tokenize(section.title);
		const paragraphs = section.text.split(/\n{2,}/);

		let score = 0;
		let bestParagraph = "";
		let bestParagraphScore = 0;
		for (const term of terms) if (titleTokens.includes(term)) score += 10;

		for (const paragraph of paragraphs) {
			const tokens = tokenize(paragraph);
			let paragraphScore = 0;
			for (const term of terms) {
				for (const token of tokens) if (token === term) paragraphScore += 1;
			}
			score += paragraphScore;
			if (paragraphScore > bestParagraphScore) {
				bestParagraphScore = paragraphScore;
				bestParagraph = paragraph;
			}
		}

		if (score > 0) {
			hits.push({
				title: section.title,
				url: section.url,
				snippet: bestParagraph.length > 700 ? `${bestParagraph.slice(0, 700)}…` : bestParagraph,
				score,
			});
		}
	}

	return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
