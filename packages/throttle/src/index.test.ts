import assert from "node:assert/strict";
import test from "node:test";
import type { Api, BeforeHook } from "@yaebal/core";
import { reserve, throttle } from "./index.js";

test("reserve runs the first call immediately", () => {
	assert.deepEqual(reserve(1000, 0, 34), { at: 1000, next: 1034 });
});

test("reserve spaces rapid calls by the interval", () => {
	assert.deepEqual(reserve(1000, 1034, 34), { at: 1034, next: 1068 });
	assert.deepEqual(reserve(1034, 1068, 34), { at: 1068, next: 1102 });
});

test("reserve respects real elapsed time (no artificial wait)", () => {
	assert.deepEqual(reserve(2000, 1068, 34), { at: 2000, next: 2034 });
});

test("throttle registers a before hook that resolves", async () => {
	let hook: BeforeHook | undefined;

	const api = {
		before: (h: BeforeHook) => {
			hook = h;
			return api as Api;
		},
	} as Api;

	throttle(api, { minIntervalMs: 0 });
	assert.equal(typeof hook, "function");

	await hook?.("sendMessage", undefined); // interval 0 → no delay
});

test("throttle can be installed as a bot plugin", () => {
	let hook: BeforeHook | undefined;
	const api = {
		before: (h: BeforeHook) => {
			hook = h;
			return api as Api;
		},
	} as Api;

	throttle({ minIntervalMs: 0 })({ api } as never);

	assert.equal(typeof hook, "function");
});
