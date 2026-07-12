import type {
	AnalyticsAdapter,
	AnalyticsEvent,
	AnalyticsQuery,
	AnalyticsReport,
} from "../types.js";

export interface MemoryAdapter extends AnalyticsAdapter {
	/** every event tracked so far, oldest first. */
	readonly events: readonly AnalyticsEvent[];
	/** person-properties recorded via `identify`, keyed by id — later calls merge onto earlier ones. */
	readonly identities: ReadonlyMap<string, Record<string, unknown>>;
	/** drop every recorded event and identity. */
	clear(): void;
	// unlike the base AnalyticsAdapter, every one of these is always present on a memoryAdapter()
	identify(id: string, properties: Record<string, unknown>): void;
	query(query: AnalyticsQuery): Promise<AnalyticsReport>;
}

/**
 * an in-memory sink — for tests (`memoryAdapter()` instead of hand-rolling a fake adapter every
 * time, which every test in this package used to do) and small bots that want `/stats` without
 * standing up a database. supports `query()`, so `analyticsAdmin()` works out of the box.
 */
export function memoryAdapter(): MemoryAdapter {
	const events: AnalyticsEvent[] = [];
	const identities = new Map<string, Record<string, unknown>>();

	return {
		events,
		identities,
		track(event) {
			events.push(event);
		},
		identify(id, properties) {
			identities.set(id, { ...identities.get(id), ...properties });
		},
		clear() {
			events.length = 0;
			identities.clear();
		},
		query({ since, limit = 10 }: AnalyticsQuery): Promise<AnalyticsReport> {
			const counts = new Map<string, number>();
			let total = 0;

			for (const event of events) {
				if (event.timestamp < since) continue;
				total++;
				counts.set(event.name, (counts.get(event.name) ?? 0) + 1);
			}

			const topEvents = [...counts.entries()]
				.sort((a, b) => b[1] - a[1])
				.slice(0, limit)
				.map(([name, count]) => ({ name, count }));

			return Promise.resolve({ total, topEvents });
		},
	};
}
