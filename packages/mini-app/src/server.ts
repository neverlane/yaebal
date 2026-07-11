import {
	type InitDataValidationResult,
	type ValidateInitDataOptions,
	validateInitData,
} from "./init-data.js";

const AUTH_HEADER_SCHEME = "tma";

/**
 * extract the raw `initData` string from an `Authorization: tma <initData>` header — the
 * convention telegram's own [Validating data for Mini Apps used as authentication in
 * a bot's HTTP server](https://core.telegram.org/bots/webapps#validating-data-for-mini-apps-used-as-authentication)
 * flow (and every major TMA library) uses. framework-agnostic: pass whatever string your server
 * gave you for the header (`req.headers.get("authorization")`, `req.headers.authorization`, …).
 *
 * returns `undefined` if the header is missing, doesn't use the `tma` scheme, or has no payload.
 */
export function initDataFromAuthHeader(header: string | null | undefined): string | undefined {
	if (!header) return undefined;
	const spaceIndex = header.indexOf(" ");
	if (spaceIndex === -1) return undefined;
	if (header.slice(0, spaceIndex).toLowerCase() !== AUTH_HEADER_SCHEME) return undefined;
	const initData = header.slice(spaceIndex + 1).trim();
	return initData.length > 0 ? initData : undefined;
}

/**
 * {@link validateInitData}, reading `initData` from an `Authorization: tma <initData>` header —
 * the one-call version of a mini app backend's auth guard.
 *
 * ```ts
 * const result = await validateAuthHeader(req.headers.get("authorization"), botToken);
 * if (!result.ok) return new Response("unauthorized", { status: 401 });
 * ```
 *
 * a missing/malformed header resolves as `{ ok: false, reason: "missing_hash" }` — there's no
 * `initData` to check, same failure shape as calling {@link validateInitData} with an empty string.
 */
export async function validateAuthHeader(
	header: string | null | undefined,
	botToken: string,
	options?: ValidateInitDataOptions,
): Promise<InitDataValidationResult> {
	const initData = initDataFromAuthHeader(header);
	if (!initData) return { ok: false, reason: "missing_hash" };
	return validateInitData(initData, botToken, options);
}
