import type { TestPack } from "@yaebal/test";
import { type AutoRetryOptions, autoRetry } from "./index.js";

/**
 * wires {@link autoRetry} onto a `TestEnv`'s mock api — pass to `createTestEnv(bot, { packs: [againTestPack()] })`
 * so retry tests don't need to call `autoRetry(env.api)` by hand.
 *
 * @example
 * const env = createTestEnv(bot, { packs: [againTestPack({ maxRetries: 2 })] });
 * env.onApi("sendMessage", apiError(429, "Too Many Requests", { retry_after: 0 }), { times: 1 });
 * await env.createUser().sendCommand("start"); // retries once, then succeeds
 */
export function againTestPack(options?: AutoRetryOptions): TestPack {
	return {
		name: "again",
		setup(env) {
			autoRetry(env.api, options);
		},
	};
}
