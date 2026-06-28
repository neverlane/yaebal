import assert from "node:assert/strict";
import test from "node:test";
import { broadcast } from "./index.js";

function fakeApi(failOn: Array<number | string> = []) {
	const sentTo: Array<number | string> = [];
	const api = {
		sendMessage: (params: { chat_id: number | string }) => {
			if (failOn.includes(params.chat_id)) return Promise.reject(new Error("blocked"));
			sentTo.push(params.chat_id);
			return Promise.resolve({ message_id: 1 });
		},
	} as never;

	return { api, sentTo };
}

test("broadcast sends to every chat and counts successes", async () => {
	const { api, sentTo } = fakeApi();
	const result = await broadcast(api, [1, 2, 3], "hi");

	assert.deepEqual(result, { sent: 3, failed: 0 });
	assert.deepEqual(sentTo, [1, 2, 3]);
});

test("broadcast survives failures and reports them", async () => {
	const { api, sentTo } = fakeApi([2]);

	const failures: Array<number | string> = [];
	const result = await broadcast(api, [1, 2, 3], "hi", {
		onError: (id) => failures.push(id),
	});

	assert.deepEqual(result, { sent: 2, failed: 1 });
	assert.deepEqual(sentTo, [1, 3]); // 2 failed but didn't abort the run
	assert.deepEqual(failures, [2]);
});

test("broadcast merges extra params into every send", async () => {
	const seen: unknown[] = [];
	const api = {
		sendMessage: (p: unknown) => {
			seen.push(p);
			return Promise.resolve({ message_id: 1 });
		},
	} as never;
	
	await broadcast(api, [10], "yo", { extra: { parse_mode: "HTML" } });
	assert.deepEqual(seen, [{ chat_id: 10, text: "yo", parse_mode: "HTML" }]);
});
