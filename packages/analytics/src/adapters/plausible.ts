import type { AnalyticsAdapter, AnalyticsEvent } from "../types.js";

export interface PlausibleAdapterOptions {
	/** the site domain plausible tracks this bot under, e.g. `"mybot.example"`. */
	domain: string;
	/** self-hosted plausible instance. defaults to `https://plausible.io`. */
	apiHost?: string;
	/** plausible's events api scopes by (fake) page url — override how one is built per event. */
	url?: (event: AnalyticsEvent) => string;
	/** injectable for tests; defaults to the global `fetch`. */
	fetch?: typeof fetch;
	/** abort a request that hangs this long. defaults to `10_000`ms. */
	timeoutMs?: number;
}

/** plausible's events api only accepts scalar (string/number/boolean) custom props — an
 * object/array value would otherwise serialize as `"[object Object]"` and silently corrupt the
 * breakdown, so it's dropped instead. */
function scalarProps(
	properties: Record<string, unknown> | undefined,
): Record<string, string | number | boolean> | undefined {
	if (!properties) return undefined;

	const out: Record<string, string | number | boolean> = {};
	let any = false;
	for (const [key, value] of Object.entries(properties)) {
		if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
			out[key] = value;
			any = true;
		}
	}
	return any ? out : undefined;
}

function hashString(input: string): number {
	let hash = 0;
	for (let i = 0; i < input.length; i++) hash = (Math.imul(hash, 31) + input.charCodeAt(i)) | 0;
	return hash;
}

/**
 * a stand-in client IP, deterministic per user/chat. plausible dedupes "unique visitors" by
 * hashing IP + user-agent — without this, every event from a bot process carries the SAME real
 * IP (the server's), so plausible sees the entire bot as one visitor no matter how many distinct
 * telegram users trigger events. this isn't a real IP; it's derived from the caller's own id so
 * the same user consistently maps to the same synthetic address, keeping visitor counts meaningful.
 */
function syntheticIp(event: AnalyticsEvent): string {
	const id = event.userId ?? event.chatId ?? 0;
	const n = typeof id === "number" ? id : Math.abs(hashString(String(id)));
	return `${(n >>> 24) & 255 || 1}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
}

/** forward events to plausible's events api (`POST /api/event`) — no client library needed. */
export function plausibleAdapter(options: PlausibleAdapterOptions): AnalyticsAdapter {
	const apiHost = options.apiHost ?? "https://plausible.io";
	const doFetch = options.fetch ?? fetch;
	const timeoutMs = options.timeoutMs ?? 10_000;
	const buildUrl =
		options.url ?? ((event: AnalyticsEvent) => `app://${options.domain}/${event.name}`);

	return {
		async track(event) {
			const props = scalarProps({
				...event.properties,
				...(event.userId !== undefined ? { userId: event.userId } : {}),
				...(event.chatId !== undefined ? { chatId: event.chatId } : {}),
			});

			const res = await doFetch(`${apiHost}/api/event`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"user-agent": "yaebal-analytics",
					"x-forwarded-for": syntheticIp(event),
				},
				body: JSON.stringify({
					name: event.name,
					url: buildUrl(event),
					domain: options.domain,
					props,
				}),
				signal: AbortSignal.timeout(timeoutMs),
			});

			if (!res.ok) {
				const detail = await res.text().catch(() => "");
				throw new Error(
					`plausibleAdapter: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`,
				);
			}

			// drain the (unused) success body so undici doesn't hold the keep-alive socket open.
			await res.body?.cancel();
		},
	};
}
