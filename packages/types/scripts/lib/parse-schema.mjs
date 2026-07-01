// our own Telegram Bot API HTML -> schema.json parser. no dependency on any third-party
// scraper/schema project (ark0f/tg-bot-api, @gramio/schema-parser, ...) — this reads
// core.telegram.org/bots/api directly and is the single source of truth for @yaebal/types.
//
// output shape matches what packages/types/scripts/generate.mjs and
// packages/contexts/scripts/generate.mjs already consume: { version, recent_changes, methods, objects }.

import { htmlToMarkdown, parseTable, parseListItems, extractSingleLink, stripTags } from "./html.mjs";
import { parseTypeCell } from "./parse-type.mjs";
import { extractReturnType, extractEnum, extractLength } from "./parse-return-type.mjs";

const API_URL = "https://core.telegram.org/bots/api";

export async function fetchApiHtml() {
	const res = await fetch(API_URL);
	if (!res.ok) throw new Error(`fetch ${API_URL} failed: ${res.status} ${res.statusText}`);

	return res.text();
}

const MONTHS = {
	january: 1,
	february: 2,
	march: 3,
	april: 4,
	may: 5,
	june: 6,
	july: 7,
	august: 8,
	september: 9,
	october: 10,
	november: 11,
	december: 12,
};

/**
 * the docs state the current version only inside the "Recent changes" log, as
 * `<h4>Month D, YYYY</h4><p><strong>Bot API X.Y</strong></p>` for the newest entry.
 */
export function parseVersion(html) {
	const changesIdx = html.indexOf('name="recent-changes"');
	if (changesIdx === -1) throw new Error("parseVersion: couldn't find the Recent changes section");

	const tail = html.slice(changesIdx);

	// first `<h4>` after the "Recent changes" anchor is the newest changelog entry's date heading
	const dateMatch = tail.match(/<h4><a class="anchor" name="[^"]+" href="#[^"]+"><i class="anchor-icon"><\/i><\/a>([^<]+)<\/h4>/i);
	if (!dateMatch) throw new Error("parseVersion: couldn't find the first changelog date heading");

	const dateText = dateMatch[1].trim();
	const dm = dateText.match(/([A-Za-z]+)\s+(\d+),\s+(\d+)/);
	if (!dm) throw new Error(`parseVersion: unrecognized date heading "${dateText}"`);

	const month = MONTHS[dm[1].toLowerCase()];
	if (!month) throw new Error(`parseVersion: unrecognized month "${dm[1]}"`);

	const versionMatch = tail.slice(dateMatch.index).match(/<strong>Bot API (\d+)\.(\d+)(?:\.(\d+))?<\/strong>/i);
	if (!versionMatch) throw new Error("parseVersion: couldn't find the Bot API version line");

	return {
		version: {
			major: Number(versionMatch[1]),
			minor: Number(versionMatch[2]),
			patch: versionMatch[3] ? Number(versionMatch[3]) : 0,
		},
		recent_changes: { year: Number(dm[3]), month, day: Number(dm[2]) },
	};
}

const H4_RE = /<h4><a class="anchor" name="([^"]+)" href="#\1"><i class="anchor-icon"><\/i><\/a>([^<]+)<\/h4>/g;
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9]*$/;

/** every top-level `<h4>` entry with its raw content up to the next `<h4>` (any kind). */
function splitSections(html) {
	const heads = [...html.matchAll(H4_RE)];
	const sections = [];

	for (let i = 0; i < heads.length; i++) {
		const head = heads[i];
		const name = head[2].trim();
		if (!IDENTIFIER.test(name)) continue;

		const start = head.index + head[0].length;
		const end = i + 1 < heads.length ? heads[i + 1].index : html.length;

		sections.push({ name, anchor: head[1], content: html.slice(start, end) });
	}

	return sections;
}

/** the raw-HTML description (everything before the first table/list) and its converted markdown. */
function splitDescription(content) {
	const tableIdx = content.search(/<table/i);
	const listIdx = content.search(/<ul>/i);
	const candidates = [tableIdx, listIdx].filter((i) => i !== -1);
	const boundary = candidates.length > 0 ? Math.min(...candidates) : content.length;

	const raw = content.slice(0, boundary);
	return { raw, markdown: htmlToMarkdown(raw), rest: content.slice(boundary) };
}

function parseField(name, typeHtml, descriptionHtml, required) {
	const type = parseTypeCell(typeHtml);
	const field = {
		name,
		description: htmlToMarkdown(descriptionHtml),
		required,
		...type,
	};

	if (type.type === "string") {
		const enumeration = extractEnum(descriptionHtml);
		if (enumeration) field.enum = enumeration;

		const length = extractLength(descriptionHtml);
		if (length) Object.assign(field, length);
	}

	return field;
}

const OPTIONAL_PREFIX = /^\s*<em>Optional<\/em>\.\s*/i;

function parseMethod(section) {
	const { raw, markdown, rest } = splitDescription(section.content);
	const table = parseTable(rest);

	const arguments_ =
		table && table.header.includes("Required")
			? table.rows.map((cells) => {
					const [name, typeHtml, requiredHtml, descHtml] = cells;
					return parseField(stripTags(name), typeHtml, descHtml, stripTags(requiredHtml).toLowerCase() === "yes");
				})
			: [];

	return {
		name: section.name,
		description: markdown,
		...(arguments_.length > 0 ? { arguments: arguments_ } : {}),
		return_type: extractReturnType(raw),
		documentation_link: `${API_URL}/#${section.anchor}`,
	};
}

function parseObject(section) {
	const { raw, markdown, rest } = splitDescription(section.content);
	const table = parseTable(rest);
	const listItems = table ? null : parseListItems(rest);

	const base = { name: section.name, description: markdown, documentation_link: `${API_URL}/#${section.anchor}` };

	if (table && !table.header.includes("Required")) {
		const properties = table.rows.map((cells) => {
			const [name, typeHtml, descHtml] = cells;
			return parseField(stripTags(name), typeHtml, descHtml, !OPTIONAL_PREFIX.test(descHtml));
		});

		return { ...base, type: "properties", properties };
	}

	if (listItems) {
		const any_of = listItems.map((item) => {
			const link = extractSingleLink(item);
			return link ? { type: "reference", reference: link.text } : { type: "unknown" };
		});

		return { ...base, type: "any_of", any_of };
	}

	// marker type with no fields (e.g. CallbackGame, ForumTopicClosed) — nothing more to describe
	void raw;
	return base;
}

export function parseSchema(html) {
	const { version, recent_changes } = parseVersion(html);
	const sections = splitSections(html);

	const methods = [];
	const objects = [];

	for (const section of sections) {
		const isMethod = /^[a-z]/.test(section.name);
		if (isMethod) methods.push(parseMethod(section));
		else objects.push(parseObject(section));
	}

	return { version, recent_changes, methods, objects };
}
