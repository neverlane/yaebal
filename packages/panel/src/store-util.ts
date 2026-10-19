// internal helpers shared by the built-in stores — not part of any public entry point.
import type { PanelSearchResult } from "./index.js";

/**
 * keep the most recent `limit` entries — with sqlite's `LIMIT` semantics, so every store
 * agrees: `0` means none (a bare `slice(-0)` would return everything), negative means no cap.
 */
export function applyHistoryLimit<T>(list: T[], limit: number | undefined): T[] {
	if (limit === undefined || limit < 0) return list;
	return limit === 0 ? [] : list.slice(-limit);
}

/** order search hits newest-first (like `SqlitePanelStore`) and cap them at `limit` (negative: no cap). */
export function newestFirst(results: PanelSearchResult[], limit: number): PanelSearchResult[] {
	results.sort(
		(a, b) => b.message.date - a.message.date || (b.message.seq ?? 0) - (a.message.seq ?? 0),
	);
	return limit < 0 ? results : results.slice(0, limit);
}
