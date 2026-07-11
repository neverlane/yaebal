import type { FlagProvider } from "../types.js";

/** the evaluation detail `variationDetail` resolves to — the subset this adapter reads. */
export interface LaunchDarklyEvaluationDetail {
	value: boolean;
	reason: { kind: string; errorKind?: string };
}

/**
 * the subset of a LaunchDarkly server-side client (`@launchdarkly/node-server-sdk`) the adapter
 * needs, typed structurally so this package depends on no LaunchDarkly SDK.
 */
export interface LaunchDarklyClientLike {
	variationDetail(
		key: string,
		context: unknown,
		defaultValue: boolean,
	): Promise<LaunchDarklyEvaluationDetail>;
}

/**
 * consult LaunchDarkly before the local catalog: `provider: launchDarklyAdapter(ldClient)`.
 *
 * uses `variationDetail` rather than `variation` — a plain `variation` call always resolves to a
 * boolean (LaunchDarkly substitutes the given default on any error), so a flag LaunchDarkly
 * doesn't know about would look identical to one explicitly set to `false`, permanently hiding
 * the local catalog's rules for it. `variationDetail` exposes *why* the value was produced:
 * `reason.errorKind` of `FLAG_NOT_FOUND` or `CLIENT_NOT_READY` means LaunchDarkly has no real
 * answer, so this adapter returns `undefined` and defers to local rules for that flag — otherwise
 * LaunchDarkly's `value` is authoritative.
 */
export function launchDarklyAdapter(client: LaunchDarklyClientLike): FlagProvider {
	return {
		async isEnabled(key, evalContext) {
			const ldContext = {
				kind: "user",
				key: String(evalContext.userId ?? evalContext.chatId ?? "anonymous"),
			};

			const detail = await client.variationDetail(key, ldContext, false);
			if (
				detail.reason.kind === "ERROR" &&
				(detail.reason.errorKind === "FLAG_NOT_FOUND" ||
					detail.reason.errorKind === "CLIENT_NOT_READY")
			) {
				return undefined;
			}

			return detail.value;
		},
	};
}
