import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { type Api, createApi } from "@yaebal/core";
import { guardWidgets } from "./guard.js";
import { WidgetError } from "./limits.js";

/** a real Api whose transport records calls instead of hitting the network. */
function recordingApi(): { api: Api; calls: string[] } {
	const calls: string[] = [];
	const api = createApi("123:abc", {
		fetch: async (input) => {
			calls.push(String(input).split("/").at(-1) as string);
			return new Response(JSON.stringify({ ok: true, result: true }), {
				headers: { "content-type": "application/json" },
			});
		},
	});
	return { api, calls };
}

const code = (c: string) => (e: unknown) => e instanceof WidgetError && e.code === c;
const noise = (n: number) => randomBytes(n).toString("base64").slice(0, n);

test("valid widget calls pass through untouched", async () => {
	const { api, calls } = recordingApi();
	assert.equal(guardWidgets(api), api);
	assert.equal(guardWidgets(api), api); // idempotent — one hook, not two
	await api.sendWidget({
		chat_id: 1,
		html: "<b>hi</b>",
		width: 300,
		height: 100,
		public_data: "p",
		chat_data: "c",
	});
	await api.sendSharedWidget({ chat_id: 1, widget_id: "w", chat_data: "c" });
	await api.editMessageWidgetData({ chat_id: 1, message_id: 1, public_data: "" });
	await api.editSharedWidgetData({ widget_id: "w", public_data: "p", cache_time: 30 });
	await api.answerWidgetQuery({ widget_query_id: "q", data: "ok" });
	await api.answerWidgetQuery({ widget_query_id: "q" });
	await api.answerInlineQuery({
		inline_query_id: "i",
		results: [
			{ type: "article", id: "1", title: "t", input_message_content: { html: "<p>w</p>" } },
			{ type: "article", id: "2", title: "t", input_message_content: { message_text: "plain" } },
			{
				type: "article",
				id: "3",
				title: "t",
				input_message_content: { widget_id: "w", chat_data: "c" },
			},
		],
	});
	await api.getMe();
	await api.call("sendWidget");
	assert.deepEqual(calls, [
		"sendWidget",
		"sendSharedWidget",
		"editMessageWidgetData",
		"editSharedWidgetData",
		"answerWidgetQuery",
		"answerWidgetQuery",
		"answerInlineQuery",
		"getMe",
		"sendWidget",
	]);
});

test("payloads telegram would reject throw before the request", async () => {
	const { api, calls } = recordingApi();
	guardWidgets(api);
	await assert.rejects(
		api.sendWidget({ chat_id: 1, html: "" }),
		code("INPUT_MEDIA_WIDGET_HTML_INVALID"),
	);
	await assert.rejects(
		api.sendWidget({ chat_id: 1, html: noise(6000) }),
		code("INPUT_MEDIA_WIDGET_TOO_LARGE"),
	);
	await assert.rejects(
		api.sendWidget({ chat_id: 1, html: "<p></p>", width: 0 }),
		code("WIDGET_SIZE_INVALID"),
	);
	await assert.rejects(
		api.sendWidget({ chat_id: 1, html: "<p></p>", height: 2.5 }),
		code("WIDGET_SIZE_INVALID"),
	);
	await assert.rejects(
		api.sendSharedWidget({ chat_id: 1, widget_id: "w", chat_data: "x".repeat(1025) }),
		code("INPUT_MEDIA_WIDGET_DATA_TOO_LARGE"),
	);
	await assert.rejects(
		api.editSharedWidgetData({ widget_id: "w", public_data: "p", cache_time: 1 }),
		code("WIDGET_CACHE_TIME_INVALID"),
	);
	await assert.rejects(
		api.editSharedWidgetData({ widget_id: "w", public_data: "\0" }),
		code("INPUT_MEDIA_WIDGET_DATA_INVALID"),
	);
	await assert.rejects(
		api.answerWidgetQuery({ widget_query_id: "q", data: "x".repeat(1025) }),
		code("WIDGET_RESULT_TOO_LARGE"),
	);
	await assert.rejects(
		api.answerInlineQuery({
			inline_query_id: "i",
			results: [
				{
					type: "article",
					id: "1",
					title: "t",
					input_message_content: { html: "<p>w</p>", public_data: "x".repeat(1025) },
				},
			],
		}),
		code("INPUT_MEDIA_WIDGET_DATA_TOO_LARGE"),
	);
	await assert.rejects(
		api.savePreparedInlineMessage({
			user_id: 1,
			result: { type: "article", id: "1", title: "t", input_message_content: { html: "" } },
		}),
		code("INPUT_MEDIA_WIDGET_HTML_INVALID"),
	);
	assert.deepEqual(calls, []);
});

test("savePreparedInlineMessage with a regular result and odd shapes are ignored", async () => {
	const { api, calls } = recordingApi();
	guardWidgets(api);
	await api.savePreparedInlineMessage({
		user_id: 1,
		result: { type: "article", id: "1", title: "t", input_message_content: { message_text: "m" } },
	});
	await api.call("answerInlineQuery", {
		inline_query_id: "i",
		results: [null, "x", { id: "no content" }],
	});
	await api.call("savePreparedInlineMessage", { user_id: 1 });
	assert.deepEqual(calls, [
		"savePreparedInlineMessage",
		"answerInlineQuery",
		"savePreparedInlineMessage",
	]);
});
