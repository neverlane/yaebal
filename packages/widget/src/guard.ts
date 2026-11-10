import type { Api } from "@yaebal/core";
import { assertAnswer, assertCacheTime, assertData, assertDimension } from "./limits.js";
import { checkHtml } from "./size.js";

const guarded = new WeakSet<Api>();

type Params = Record<string, unknown>;

async function checkContent(content: Params): Promise<void> {
	if (typeof content.html === "string") await checkHtml(content.html);
	if (typeof content.width === "number") assertDimension(content.width, "width");
	if (typeof content.height === "number") assertDimension(content.height, "height");
	if (typeof content.public_data === "string") assertData(content.public_data, "public_data");
	if (typeof content.chat_data === "string") assertData(content.chat_data, "chat_data");
}

function inlineContents(params: Params): Params[] {
	const results = Array.isArray(params.results)
		? params.results
		: params.result
			? [params.result]
			: [];
	return results
		.map((r) => (r && typeof r === "object" ? (r as Params).input_message_content : undefined))
		.filter((c): c is Params => !!c && typeof c === "object" && ("html" in c || "widget_id" in c));
}

/**
 * validate every widget payload before it leaves the process: `sendWidget`, `sendSharedWidget`,
 * `editMessageWidgetData`, `editSharedWidgetData`, `answerWidgetQuery`, and widget contents in
 * `answerInlineQuery` / `savePreparedInlineMessage` results. a payload telegram would reject
 * throws a `WidgetError` locally — with the measured size in the message — instead of a 400.
 *
 * idempotent per `Api` instance. returns the same `api`.
 */
export function guardWidgets(api: Api): Api {
	if (guarded.has(api)) return api;
	guarded.add(api);

	api.before(async (method, params) => {
		if (!params) return;
		switch (method) {
			case "sendWidget":
			case "sendSharedWidget":
			case "editMessageWidgetData":
				await checkContent(params);
				return;
			case "editSharedWidgetData":
				await checkContent(params);
				if (typeof params.cache_time === "number") assertCacheTime(params.cache_time);
				return;
			case "answerWidgetQuery":
				if (typeof params.data === "string") assertAnswer(params.data);
				return;
			case "answerInlineQuery":
			case "savePreparedInlineMessage":
				for (const content of inlineContents(params)) await checkContent(content);
				return;
		}
	});

	return api;
}
