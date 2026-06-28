import type { Highlighter } from "shiki";

let pending: Promise<Highlighter> | null = null;

export function getHighlighter(): Promise<Highlighter> {
	if (!pending) {
		pending = import("shiki").then((shiki) =>
			shiki.createHighlighter({
				themes: ["github-light", "github-dark"],
				langs: ["typescript", "javascript", "bash", "json", "diff", "tsx"],
			}),
		);
	}
	
	return pending;
}

const MAP: Record<string, string> = {
	ts: "typescript",
	js: "javascript",
	sh: "bash",
	json: "json",
	diff: "diff",
	jsx: "tsx",
	tsx: "tsx",
	text: "text",
};

export function langOf(lang: string): string {
	return MAP[lang] ?? "typescript";
}
