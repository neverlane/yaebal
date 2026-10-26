import { type Api, type CallOptions, createApi } from "@yaebal/core";
import type { SdkBridge } from "./sdk.js";

/** scheme `createApi` is pointed at. `fetch` below is the only thing that understands it. */
export const SDK_ORIGIN = "https://tgcloud.invalid";

/**
 * bot api method encoded in a client url, wherever it was aimed — the public
 * origin, a local bot api server, or {@link SDK_ORIGIN}. anything else (a plugin
 * calling a third party) is not a bot api call.
 */
function botApiMethod(url: string): string | undefined {
	const path = new URL(url, SDK_ORIGIN).pathname;
	return /\/bot[^/]+\/([^/]+)$/.exec(path)?.[1];
}

/**
 * `createApi` always POSTs JSON or multipart to `${apiRoot}/bot<token>/<method>`.
 * telegram serverless has no token and no HTTP bot api — `sdk.api` is the client.
 * this fetch turns that body back into params (rehydrating `InputFile`s from
 * multipart) and calls `sdk`. every other url passes through, so hooks, retries
 * and `format` stay exactly core's.
 */
export function createSdkFetch(bridge: SdkBridge, base: typeof fetch = fetch): typeof fetch {
	return async (input, init) => {
		const url = input instanceof Request ? input.url : String(input);
		const method = botApiMethod(url);
		if (!method) return base(input, init);

		const params = await readParams(
			init?.body ?? (input instanceof Request ? input.body : undefined),
			bridge,
		);
		const fn = bridge.api[method] as
			| ((params?: Record<string, unknown>) => Promise<unknown>)
			| undefined;
		if (typeof fn !== "function") {
			return jsonResponse({ ok: false, error_code: 404, description: `sdk.api has no ${method}` });
		}

		try {
			const result = await fn(params);
			return jsonResponse({ ok: true, result });
		} catch (error) {
			if (bridge.isBotApiError(error)) {
				return jsonResponse({
					ok: false,
					error_code: error.code,
					description: error.description,
					parameters: error.parameters,
				});
			}
			throw error;
		}
	};
}

/**
 * a yaebal {@link Api} whose transport is telegram serverless `sdk`.
 * the token is irrelevant — tgcloud authenticates the bot itself — and is
 * only there because `createApi` requires one.
 */
export function createSdkApi(bridge: SdkBridge, token = "tgcloud"): Api {
	const api = createApi(token, { apiRoot: SDK_ORIGIN, fetch: createSdkFetch(bridge) });
	return Object.assign(api, {
		downloadFile: async (fileId: string, options?: CallOptions) => {
			options?.signal?.throwIfAborted();
			const read = bridge.api.getFileContent;
			if (!read) throw new Error("@yaebal/tgcloud: sdk.api.getFileContent is missing");
			const bytes = await read(fileId);
			return { filePath: fileId, bytes };
		},
		fileUrl: (): string => {
			throw new Error(
				"@yaebal/tgcloud: fileUrl() needs the bot token, which serverless does not expose. use api.downloadFile().",
			);
		},
	});
}

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

/** reverse what `encodeRequest` did, so `sdk.api` sees params instead of a body. */
async function readParams(
	body: RequestInit["body"],
	bridge: SdkBridge,
): Promise<Record<string, unknown> | undefined> {
	if (body == null) return undefined;
	if (typeof body === "string") return JSON.parse(body) as Record<string, unknown>;
	if (body instanceof URLSearchParams) return Object.fromEntries(body);
	if (body instanceof FormData) return formToParams(body, bridge);
	if (body instanceof ReadableStream) return readParams(await new Response(body).text(), bridge);
	throw new Error("@yaebal/tgcloud: unsupported bot api request body");
}

async function formToParams(form: FormData, bridge: SdkBridge): Promise<Record<string, unknown>> {
	const files = new Map<string, InstanceType<SdkBridge["InputFile"]>>();
	const fields = new Map<string, string>();
	for (const [key, value] of form) {
		if (typeof value === "string") fields.set(key, value);
		else
			files.set(key, new bridge.InputFile(new Uint8Array(await value.arrayBuffer()), value.name));
	}

	const params: Record<string, unknown> = {};
	for (const [key, value] of fields) {
		if (value.startsWith("attach://")) {
			const file = files.get(value.slice("attach://".length));
			if (!file) throw new Error(`@yaebal/tgcloud: missing upload for ${value}`);
			params[key] = file;
			continue;
		}
		params[key] = parseField(value);
	}
	return revive(params, files) as Record<string, unknown>;
}

/** multipart stores objects as JSON strings; leave plain strings alone. */
function parseField(value: string): unknown {
	if (value === "") return value;
	const first = value[0];
	if (first !== "{" && first !== "[" && first !== '"') return value;
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function revive(value: unknown, files: Map<string, InstanceType<SdkBridge["InputFile"]>>): unknown {
	if (typeof value === "string" && value.startsWith("attach://")) {
		const file = files.get(value.slice("attach://".length));
		if (!file) throw new Error(`@yaebal/tgcloud: missing upload for ${value}`);
		return file;
	}
	if (Array.isArray(value)) return value.map((item) => revive(item, files));
	if (isPlain(value)) {
		const out: Record<string, unknown> = {};
		for (const [key, child] of Object.entries(value)) out[key] = revive(child, files);
		return out;
	}
	return value;
}

function isPlain(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}
