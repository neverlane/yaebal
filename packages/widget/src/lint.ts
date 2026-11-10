import { type HtmlSource, htmlString } from "./html.js";

/**
 * a static check of widget html against telegram's widget sandbox (core.telegram.org/bots/widgets):
 * widgets run in a restricted engine with no network, a reduced tag/css/js profile and no
 * keyboard or touch events. telegram silently drops what it doesn't support, so a widget that
 * relies on it just looks broken — this catches the common cases before sending.
 *
 * it's a pattern scan, not a parser: an `error` is something that cannot work in a widget, a
 * `warning` is something that usually indicates a mistake.
 */

export type WidgetLintSeverity = "error" | "warning";

export interface WidgetLintIssue {
	/** stable rule id, e.g. `no-network`. */
	rule: string;
	severity: WidgetLintSeverity;
	message: string;
	/** 1-based line of the match in the html. */
	line: number;
	/** the matched text. */
	match: string;
}

/** where a rule looks. */
type Scope = "markup" | "script" | "style";

interface Rule {
	id: string;
	severity: WidgetLintSeverity;
	scope: Scope;
	pattern: RegExp;
	message: string;
}

const EVENTS_MESSAGE =
	"widgets get click, pointer, dblclick and contextmenu events only — no keyboard, wheel or touch events";

const RULES: readonly Rule[] = [
	{
		id: "no-network",
		severity: "error",
		scope: "script",
		pattern:
			/\b(?:fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon|importScripts|import\s*\()/g,
		message:
			"widgets have no network — every network api throws NetworkDisabledError; ask the bot with TelegramWidget.request()",
	},
	{
		id: "no-external-script",
		severity: "error",
		scope: "markup",
		pattern: /<script\b[^>]*\bsrc\s*=/gi,
		message: "external scripts are removed — inline the code",
	},
	{
		id: "no-external-resource",
		severity: "error",
		scope: "markup",
		pattern:
			/<link\b[^>]*>|\b(?:src|href)\s*=\s*["']?\s*(?:https?:)?\/\/[^"'\s>]+\.(?:css|png|jpe?g|gif|webp|svg|woff2?)\b/gi,
		message: "external resources never load — embed images as data: urls and css inline",
	},
	{
		id: "no-unsupported-element",
		severity: "error",
		scope: "markup",
		pattern:
			/<(?:input|select|textarea|form|option|progress|meter|dialog|video|audio|iframe|embed|object|template|math|ruby|marquee|font|center)\b/gi,
		message:
			"this element is removed in widgets — form controls, media, embeds and legacy markup aren't supported (use button + canvas/svg)",
	},
	{
		id: "no-unsupported-svg",
		severity: "error",
		scope: "markup",
		pattern: /<(?:clipPath|mask|pattern|marker|filter|foreignObject|animate\w*|set)\b/g,
		message:
			"this svg element is removed in widgets (clip paths, masks, patterns, markers, filters, smil, foreignObject)",
	},
	{
		id: "no-unsupported-attribute",
		severity: "warning",
		scope: "markup",
		pattern: /\s(?:contenteditable|tabindex|autofocus|draggable)\s*=/gi,
		message: "this attribute is removed in widgets",
	},
	{
		id: "no-unsupported-at-rule",
		severity: "error",
		scope: "style",
		pattern: /@(?:import|font-face|container|layer)\b/g,
		message:
			"@import, @font-face, @container and @layer are removed — widgets get generic font families only",
	},
	{
		id: "no-viewport-units",
		severity: "error",
		scope: "style",
		pattern: /\d(?:\.\d+)?d?[sl]?vh\b/g,
		message:
			"vh units are removed — the widget has no viewport height; use fixed px or let it size itself",
	},
	{
		id: "no-scroll",
		severity: "warning",
		scope: "style",
		pattern: /\boverflow(?:-[xy])?\s*:\s*(?:auto|scroll)\b|\bposition\s*:\s*sticky\b/g,
		message:
			"widgets never scroll (overflow auto/scroll and position: sticky are removed) — content past the height is clipped",
	},
	{
		id: "no-unsupported-css",
		severity: "warning",
		scope: "style",
		pattern:
			/\b(?:clip-path|mask(?:-image)?|mix-blend-mode|text-shadow|line-clamp|-webkit-line-clamp|columns|column-count)\s*:|:has\(|:focus(?:-within|-visible)?\b|:checked\b|\b(?:rotate[XYZ3]|translate[Z3]|perspective)\s*\(/g,
		message: "this css isn't in the widget profile and is ignored",
	},
	{
		id: "no-dialogs",
		severity: "warning",
		scope: "script",
		pattern: /\b(?:alert|confirm|prompt)\s*\(/g,
		message:
			"alert/confirm/prompt don't show anything in widgets (confirm returns false, prompt null)",
	},
	{
		id: "no-unsupported-api",
		severity: "error",
		scope: "script",
		pattern:
			/\bnavigator\.clipboard\b|\bnew\s+(?:Blob|FileReader)\b|\battachShadow\s*\(|\brequestFullscreen\s*\(|\bgetContext\s*\(\s*["']webgl/g,
		message: "this api is disabled in widgets — use TelegramWidget.copyText() for the clipboard",
	},
	{
		id: "no-unsupported-events",
		severity: "warning",
		scope: "script",
		pattern:
			/["'](?:key(?:down|up|press)|wheel|touch(?:start|move|end|cancel))["']|\.on(?:key(?:down|up|press)|wheel|touch(?:start|move|end|cancel))\s*=/g,
		message: EVENTS_MESSAGE,
	},
	{
		id: "no-unsupported-events",
		severity: "warning",
		scope: "markup",
		pattern: /\son(?:key(?:down|up|press)|wheel|touch(?:start|move|end|cancel))\s*=/gi,
		message: EVENTS_MESSAGE,
	},
];

const SCRIPT = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi;
const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
const STYLE_ATTR = /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const HANDLER_ATTR = /\son[a-z]+\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

interface Region {
	text: string;
	offset: number;
}

function regions(source: string, pattern: RegExp): Region[] {
	const out: Region[] = [];
	for (const m of source.matchAll(pattern)) {
		const text = m[1] ?? m[2] ?? "";
		out.push({ text, offset: (m.index as number) + m[0].indexOf(text) });
	}
	return out;
}

function lineAt(source: string, offset: number): number {
	let line = 1;
	for (let i = 0; i < offset; i++) if (source.charCodeAt(i) === 10) line++;
	return line;
}

/** blank out script/style bodies so markup rules don't fire on code or css. */
function markupOnly(source: string): string {
	const blank = (m: string) => m.replace(/[^\n]/g, " ");
	return source
		.replace(SCRIPT, (m, body: string) => m.replace(body, blank(body)))
		.replace(STYLE_BLOCK, (m, body: string) => m.replace(body, blank(body)));
}

/**
 * scan widget html for things the widget sandbox removes or disables. returns issues in source
 * order; an empty array means nothing known-bad was found (it is not a guarantee).
 */
export function lintHtml(source: HtmlSource): WidgetLintIssue[] {
	const input = htmlString(source);
	const scopes: Record<Scope, Region[]> = {
		markup: [{ text: markupOnly(input), offset: 0 }],
		script: [...regions(input, SCRIPT), ...regions(input, HANDLER_ATTR)],
		style: [...regions(input, STYLE_BLOCK), ...regions(input, STYLE_ATTR)],
	};

	const issues: (WidgetLintIssue & { at: number })[] = [];
	for (const rule of RULES) {
		for (const region of scopes[rule.scope]) {
			for (const m of region.text.matchAll(rule.pattern)) {
				const at = region.offset + (m.index as number);
				issues.push({
					rule: rule.id,
					severity: rule.severity,
					message: rule.message,
					line: lineAt(input, at),
					match: m[0].trim(),
					at,
				});
			}
		}
	}

	return issues.sort((a, b) => a.at - b.at).map(({ at: _, ...issue }) => issue);
}
