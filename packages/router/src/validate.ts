/**
 * pure validation helpers — return a message string on failure, `null` on success. never throw:
 * `load.ts` decides whether a failure throws (`strict: true`, the default) or becomes a
 * {@link RouterWarning} (`strict: false`), so these stay unit-testable without a filesystem.
 */

const COMMAND_NAME_RE = /^[a-z0-9_]{1,32}$/;

/** classic edit-distance, used only to size up "did you mean" suggestions — inputs here are short
 * (telegram update-type names), so the plain O(n*m) table is more than fast enough. */
export function levenshtein(a: string, b: string): number {
	const rows = a.length + 1;
	const cols = b.length + 1;
	const dist: number[][] = Array.from({ length: rows }, (_, i) => [i, ...Array(cols - 1).fill(0)]);
	for (let j = 1; j < cols; j++) {
		const row0 = dist[0];
		if (row0) row0[j] = j;
	}

	for (let i = 1; i < rows; i++) {
		for (let j = 1; j < cols; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			const prevRow = dist[i - 1];
			const row = dist[i];
			if (!prevRow || !row) continue;

			row[j] = Math.min(
				(row[j - 1] ?? Infinity) + 1,
				(prevRow[j] ?? Infinity) + 1,
				(prevRow[j - 1] ?? Infinity) + cost,
			);
		}
	}

	return dist[rows - 1]?.[cols - 1] ?? Math.max(a.length, b.length);
}

/** the closest candidate to `input`, or `undefined` if nothing is close enough to be worth
 * suggesting (distance capped relative to input length, so short strings don't match anything). */
export function closestMatch(input: string, candidates: readonly string[]): string | undefined {
	let best: string | undefined;
	let bestDistance = Number.POSITIVE_INFINITY;

	for (const candidate of candidates) {
		const distance = levenshtein(input, candidate);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = candidate;
		}
	}

	const threshold = Math.max(2, Math.ceil(input.length / 3));
	return best !== undefined && bestDistance <= threshold ? best : undefined;
}

/** telegram command names: 1-32 chars, lowercase a-z, 0-9 and `_` — matches `@yaebal/commands`'
 * own rule, so a name accepted here never gets rejected by the menu bridge. */
export function checkCommandName(name: string): string | null {
	if (COMMAND_NAME_RE.test(name)) return null;
	return `"${name}" is not a valid telegram command name — 1-32 chars, lowercase a-z, 0-9 and _`;
}

/** the head of an `on()` filter query (before the first `:`) must be a real telegram update type. */
export function checkOnQuery(query: string, validUpdateNames: readonly string[]): string | null {
	const [head] = query.split(":");
	if (!head) return `on-query "${query}" is missing an update type`;
	if (validUpdateNames.includes(head)) return null;

	const suggestion = closestMatch(head, validUpdateNames);
	return `"${head}" is not a telegram update type${suggestion ? ` — did you mean "${suggestion}"?` : ""} (in on-query "${query}")`;
}

/** records `key -> file` claims and flags a second file claiming the same key. */
export class DuplicateTracker {
	private readonly seen = new Map<string, string>();

	check(key: string, file: string): string | null {
		const existing = this.seen.get(key);
		if (existing === undefined) {
			this.seen.set(key, file);
			return null;
		}
		if (existing === file) return null;

		return `duplicate route "${key}" — already registered from ${existing}, also claimed by ${file}`;
	}
}

/** the file-name-derived trigger and the route's own declared trigger disagree — always a warning,
 * never a throw: this only catches copy-paste drift, the route still works as declared. */
export function checkFilenameMatch(expectedTrigger: string, actualTrigger: string): string | null {
	if (expectedTrigger === actualTrigger) return null;
	return (
		`filename suggests "${expectedTrigger}" but the route declares "${actualTrigger}" — ` +
		"rename the file or the route to match"
	);
}
