import type { Update, UpdateSink } from "@yaebal/core";

/** result of {@link collectUpdates}: an {@link UpdateSink} plus the updates it received, in order. */
export interface UpdateCollector {
	sink: UpdateSink;
	updates: Update[];
}

/** a minimal {@link UpdateSink} (the `{ handleUpdate }` shape `webhookCallback`/runners expect) that just records. */
export function collectUpdates(): UpdateCollector {
	const updates: Update[] = [];

	return {
		sink: {
			handleUpdate: async (update) => {
				updates.push(update);
			},
		},
		updates,
	};
}

/** options for {@link webhookRequest}. */
export interface WebhookRequestOptions {
	url?: string;
	method?: string;
	secretToken?: string;
	headers?: Record<string, string>;
}

/** build a `Request` carrying `update` as JSON, as telegram would POST it to a webhook handler. */
export function webhookRequest(update: Update, options: WebhookRequestOptions = {}): Request {
	const {
		url = "https://example.invalid/webhook",
		method = "POST",
		secretToken,
		headers = {},
	} = options;

	const finalHeaders: Record<string, string> = { "content-type": "application/json", ...headers };
	if (secretToken) finalHeaders["x-telegram-bot-api-secret-token"] = secretToken;

	return new Request(url, {
		method,
		headers: finalHeaders,
		body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(update),
	});
}
