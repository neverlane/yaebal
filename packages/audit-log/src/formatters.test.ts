import assert from "node:assert/strict";
import test from "node:test";
import { serializeError } from "./errors.js";
import { jsonFormatter, prettyFormatter, textFormatter } from "./formatters.js";
import type { AuditEvent } from "./types.js";

test("jsonFormatter passes the event through unchanged", () => {
	const event: AuditEvent = {
		kind: "api.call",
		level: "info",
		timestamp: 1,
		callId: "c1",
		method: "sendMessage",
		params: { text: "hi" },
		attempt: 1,
	};
	assert.equal(jsonFormatter(event), event);
});

test("prettyFormatter renders indented JSON", () => {
	const line = prettyFormatter({ kind: "bot.start", level: "info", timestamp: 1, info: {} });
	assert.ok(line.includes("\n"));
	assert.deepEqual(JSON.parse(line), { kind: "bot.start", level: "info", timestamp: 1, info: {} });
});

test("textFormatter renders a readable line per event kind, including the correlation trace", () => {
	const at = 1_700_000_000_000;

	assert.match(
		textFormatter({
			kind: "update",
			level: "info",
			timestamp: at,
			updateId: 42,
			correlationId: "corr-1",
			updateType: "message",
			chatId: 7,
			userId: 9,
			durationMs: 12,
			update: {},
		}),
		/\[corr-1\] update#42 message chat=7 user=9 \(12ms\)/,
	);

	assert.match(
		textFormatter({
			kind: "api.call",
			level: "info",
			timestamp: at,
			callId: "c1",
			method: "sendMessage",
			params: { text: "hi" },
			attempt: 1,
		}),
		/-> sendMessage \{"text":"hi"\}/,
	);

	assert.match(
		textFormatter({
			kind: "api.call",
			level: "info",
			timestamp: at,
			callId: "c1",
			method: "sendMessage",
			params: undefined,
			attempt: 2,
		}),
		/-> sendMessage attempt=2/,
	);

	assert.match(
		textFormatter({
			kind: "api.result",
			level: "info",
			timestamp: at,
			callId: "c1",
			method: "sendMessage",
			params: undefined,
			result: {},
			durationMs: 15,
		}),
		/<- sendMessage ok \(15ms\)/,
	);

	assert.match(
		textFormatter({
			kind: "api.error",
			level: "error",
			timestamp: at,
			callId: "c1",
			method: "sendMessage",
			params: undefined,
			error: serializeError(new Error("nope")),
			attempt: 2,
		}),
		/sendMessage attempt=2 nope/,
	);

	assert.match(
		textFormatter({ kind: "bot.start", level: "info", timestamp: at, info: {} }),
		/bot started/,
	);
	assert.match(textFormatter({ kind: "bot.stop", level: "info", timestamp: at }), /bot stopped/);
});
