import assert from "node:assert/strict";
import test from "node:test";
import { WidgetError } from "./limits.js";
import { fromNano, parseSignData, TON_NETWORK, toNano, tonTransaction } from "./ton.js";

const invalid = (error: unknown) =>
	error instanceof WidgetError && error.code === "WIDGET_TON_INVALID";
const NOW = 1_700_000_000_000;

test("tonTransaction normalizes amounts and sets a deadline", () => {
	const tx = tonTransaction({
		now: NOW,
		messages: [
			{ address: " EQabc ", amount: 1500000000n },
			{ address: "EQdef", amount: 42, payload: "te6cc+/=", stateInit: "AAAA" },
			{ address: "EQghi", amount: "000123" },
		],
	});
	assert.deepEqual(tx, {
		valid_until: NOW / 1000 + 300,
		messages: [
			{ address: "EQabc", amount: "1500000000" },
			{ address: "EQdef", amount: "42", payload: "te6cc+/=", stateInit: "AAAA" },
			{ address: "EQghi", amount: "123" },
		],
	});
	assert.equal(
		tonTransaction({ now: NOW, validFor: 60, messages: [{ address: "a", amount: 0 }] }).valid_until,
		NOW / 1000 + 60,
	);
	assert.equal(
		tonTransaction({
			now: NOW,
			validUntil: 1_800_000_000,
			messages: [{ address: "a", amount: "0" }],
		}).valid_until,
		1_800_000_000,
	);
	assert.ok(
		(tonTransaction({ messages: [{ address: "a", amount: 1 }] }).valid_until as number) >
			Date.now() / 1000,
	);
});

test("tonTransaction maps network names and passes raw ids through", () => {
	const one = [{ address: "a", amount: 1 }];
	assert.equal(tonTransaction({ messages: one, network: "mainnet" }).network, TON_NETWORK.mainnet);
	assert.equal(tonTransaction({ messages: one, network: "testnet" }).network, "-3");
	assert.equal(tonTransaction({ messages: one, network: "-42" }).network, "-42");
	assert.equal("network" in tonTransaction({ messages: one }), false);
});

test("tonTransaction rejects what a wallet would refuse", () => {
	const ok = { address: "a", amount: 1 };
	assert.throws(() => tonTransaction({ messages: [] }), invalid);
	assert.throws(
		() => tonTransaction({ messages: Array.from({ length: 256 }, () => ok) }),
		/1-255 messages, got 256/,
	);
	assert.throws(() => tonTransaction({ messages: [{ address: " ", amount: 1 }] }), /address/);
	assert.throws(
		() => tonTransaction({ messages: [{ address: 5 as unknown as string, amount: 1 }] }),
		invalid,
	);
	for (const amount of [-1, 1.5, 2 ** 60, "1.5", "-3", "", "abc", -1n]) {
		assert.throws(
			() => tonTransaction({ messages: [{ address: "a", amount }] }),
			/amount/,
			String(amount),
		);
	}
	assert.throws(
		() => tonTransaction({ messages: [{ ...ok, payload: "not base64!" }] }),
		/payload must be base64/,
	);
	assert.throws(() => tonTransaction({ messages: [{ ...ok, stateInit: "%%" }] }), /stateInit/);
	assert.throws(
		() => tonTransaction({ now: NOW, validUntil: NOW / 1000, messages: [ok] }),
		/future/,
	);
	assert.throws(() => tonTransaction({ now: NOW, validFor: 1.5, messages: [ok] }), /future/);
});

test("toNano is exact for strings, numbers and bigints", () => {
	assert.equal(toNano("1"), "1000000000");
	assert.equal(toNano("0.05"), "50000000");
	assert.equal(toNano(" 12.123456789 "), "12123456789");
	assert.equal(toNano(1.5), "1500000000");
	assert.equal(toNano(3n), "3000000000");
	assert.equal(toNano("0"), "0");
	for (const bad of ["1.0000000001", "-1", "1e3", "", ".5", -2])
		assert.throws(() => toNano(bad), invalid, String(bad));
	assert.throws(() => toNano(-1n), /negative/);
});

test("fromNano formats nanotons as TON", () => {
	assert.equal(fromNano("1500000000"), "1.5");
	assert.equal(fromNano(1n), "0.000000001");
	assert.equal(fromNano("3000000000"), "3");
	assert.equal(fromNano(-2500000000n), "-2.5");
	assert.equal(fromNano(toNano("7.000000123")), "7.000000123");
});

test("parseSignData parses objects and refuses everything else", () => {
	assert.deepEqual(parseSignData('{"signature":"s","timestamp":1}'), {
		signature: "s",
		timestamp: 1,
	});
	assert.equal(parseSignData("[1]"), undefined);
	assert.equal(parseSignData("null"), undefined);
	assert.equal(parseSignData("{bad"), undefined);
});
