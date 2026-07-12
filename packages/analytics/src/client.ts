import { resolveEventDef, validateCatalog } from "./catalog.js";
import type {
	Analytics,
	AnalyticsEvent,
	AnalyticsOptions,
	Anonymize,
	EventsCatalog,
} from "./types.js";

/** a fast non-cryptographic hash (fnv-1a, 32-bit) — see {@link Anonymize}'s `"hash"` mode. */
function fnv1a(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36);
}

function applyAnonymize(
	anonymize: Anonymize | undefined,
	id: number | undefined,
	kind: "user" | "chat",
): number | string | undefined {
	if (id === undefined || anonymize === undefined) return id;
	return anonymize === "hash" ? fnv1a(`${kind}:${id}`) : anonymize(id, kind);
}

function redactProps(
	properties: Record<string, unknown> | undefined,
	keys: readonly string[] | undefined,
): Record<string, unknown> | undefined {
	if (!properties || !keys || keys.length === 0) return properties;
	const out = { ...properties };
	for (const key of keys) delete out[key];
	return out;
}

/** a synthetic event name used only for `onError` reports about `flush()`/`identify()` failures
 * that aren't tied to a single tracked event — never forwarded to an adapter's `track()`. */
const FLUSH_EVENT = "$flush";
const IDENTIFY_EVENT = "$identify";

/**
 * build a standalone {@link Analytics} client, independent of any bot or `ctx`. this is the
 * unified collection point other plugins' event streams can feed into — e.g. bridge
 * `@yaebal/broadcast`'s `onEvent` with {@link fromEvent}, so a broadcast job's lifecycle lands
 * in the same adapters as `ctx.track` calls. `analytics()` (the `ctx.track` plugin) builds one of
 * these internally and adds no behavior on top — sampling, consent, redaction, anonymization,
 * per-adapter error isolation, and an honest `flush()` all live here, shared by both entry points.
 */
export function createAnalytics<const C extends EventsCatalog = EventsCatalog>(
	options: AnalyticsOptions<C>,
): Analytics<C> {
	const {
		adapters,
		onError,
		now = Date.now,
		events,
		sample = 1,
		shouldTrack,
		anonymize,
		redact,
	} = options;

	if (events) validateCatalog(events);
	if (sample < 0 || sample > 1) {
		throw new Error(`analytics: sample ${sample} is out of range — expected a value in [0, 1]`);
	}

	// every in-flight track()/identify() call and every adapter dispatch it fans out to — flush()
	// drains this to completion (not just adapters' own flush()) so a plausible/http adapter's
	// still-in-flight fetch isn't silently dropped by a shutdown that races it (see fix for the
	// "flush() doesn't wait for in-flight sends" gap the fire-and-forget design otherwise has).
	const pending = new Set<Promise<unknown>>();

	function track(promise: Promise<unknown>): void {
		pending.add(promise);
		void promise.finally(() => pending.delete(promise));
	}

	function reportError(error: unknown, event: AnalyticsEvent): void {
		if (!onError) return;
		try {
			onError(error, event);
		} catch (onErrorError) {
			// onError is user code and WILL sometimes throw (a metrics call that itself fails, a bug
			// in the handler) — it must never propagate out of track()/flush() and take the caller's
			// update handler (or shutdown sequence) down with it.
			console.warn(
				"[analytics] onError threw — swallowing so tracking stays fire-and-forget",
				onErrorError,
			);
		}
	}

	async function resolveConsent(event: AnalyticsEvent): Promise<boolean> {
		if (!shouldTrack) return true;
		try {
			return await shouldTrack(event);
		} catch {
			return true; // fail-open: a buggy consent check must never blackhole every event
		}
	}

	function fanOut(event: AnalyticsEvent): void {
		for (const adapter of adapters) {
			track(
				(async () => {
					try {
						await adapter.track(event);
					} catch (error) {
						reportError(error, event);
					}
				})(),
			);
		}
	}

	async function trackAsync(
		name: string,
		properties: Record<string, unknown> | undefined,
		userId: number | undefined,
		chatId: number | undefined,
	): Promise<void> {
		const timestamp = now();

		if (events && !(name in events)) {
			reportError(
				new TypeError(`analytics: event ${JSON.stringify(name)} is not declared in the catalog`),
				{ name, properties, userId, chatId, timestamp },
			);
			return;
		}

		const def = resolveEventDef(events, name);

		let props = properties;
		if (def?.props) {
			try {
				props = def.props.parse(properties ?? {});
			} catch (error) {
				reportError(error, { name, properties, userId, chatId, timestamp });
				return;
			}
		}

		const rawEvent: AnalyticsEvent = { name, properties: props, userId, chatId, timestamp };
		if (!(await resolveConsent(rawEvent))) return;

		const eventSample = def?.sample ?? sample;
		if (eventSample < 1 && Math.random() >= eventSample) return;

		props = redactProps(redactProps(props, def?.redact), redact);

		fanOut({
			name,
			properties: props,
			userId: applyAnonymize(anonymize, userId, "user"),
			chatId: applyAnonymize(anonymize, chatId, "chat"),
			timestamp,
		});
	}

	function trackPublic(
		name: string,
		properties: Record<string, unknown> | undefined,
		userId: number | undefined,
		chatId: number | undefined,
	): void {
		track(
			trackAsync(name, properties, userId, chatId).catch((error: unknown) => {
				// every awaited step inside trackAsync is already guarded, so this should be
				// unreachable — but an uncaught rejection here would otherwise crash the process.
				reportError(error, { name, properties, userId, chatId, timestamp: now() });
			}),
		);
	}

	function identify(id: string, properties: Record<string, unknown>): void {
		track(
			Promise.all(
				adapters.map(async (adapter) => {
					try {
						await adapter.identify?.(id, properties);
					} catch (error) {
						reportError(error, { name: IDENTIFY_EVENT, properties, timestamp: now() });
					}
				}),
			),
		);
	}

	async function flush(): Promise<void> {
		// drain every in-flight track()/identify() dispatch first — a buffering adapter (e.g.
		// clickhouseAdapter via `batched()`) only has an event in its internal buffer once its
		// track() promise resolves, so calling adapter.flush() before that would drain nothing.
		while (pending.size > 0) await Promise.allSettled([...pending]);

		const results = await Promise.allSettled(adapters.map((adapter) => adapter.flush?.()));
		for (const result of results) {
			if (result.status === "rejected") {
				reportError(result.reason, { name: FLUSH_EVENT, timestamp: now() });
			}
		}
	}

	return {
		track: ((input: {
			name: string;
			properties?: Record<string, unknown>;
			userId?: number;
			chatId?: number;
		}) => {
			trackPublic(input.name, input.properties, input.userId, input.chatId);
		}) as Analytics<C>["track"],
		identify,
		flush,
	};
}

/** shape a foreign event stream (a `{ type }` discriminated union, e.g. `BroadcastEvent`) into a
 * standalone client's `track()` input, prefixing the event name so sources stay distinguishable
 * downstream. the result is intentionally untyped (`name: string`) — a foreign stream's `type`
 * isn't a key in your `events` catalog, so `client.track(fromEvent(...))` only type-checks against
 * a `createAnalytics()` built without a catalog (or cast the result yourself for a typed one). */
export function fromEvent(
	prefix: string,
	event: { type: string } & Record<string, unknown>,
): { name: string; properties: Record<string, unknown> } {
	const { type, ...properties } = event;
	return { name: `${prefix}.${type}`, properties };
}
