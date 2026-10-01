/**
 * minimal server-sent-events reader for streaming llm http responses. yields the `data:`
 * payload of every event as a raw string — json parsing (and `[DONE]` sentinels) are the
 * caller's business, they differ per provider.
 */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
	const decoder = new TextDecoder();
	const reader = body.getReader();
	let line = "";
	let data: string[] = [];
	let skipLf = false;
	let completed = false;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				completed = true;
				break;
			}
			// SSE permits LF, CRLF and CR, including delimiters split between chunks.
			for (const ch of decoder.decode(value, { stream: true })) {
				if (skipLf) {
					skipLf = false;
					if (ch === "\n") continue;
				}
				if (ch !== "\r" && ch !== "\n") {
					line += ch;
					continue;
				}
				skipLf = ch === "\r";
				if (line === "") {
					if (data.length > 0) {
						const event = data.join("\n");
						data = [];
						yield event;
					}
				} else if (line === "data" || line.startsWith("data:")) {
					const field = line.slice(5);
					// only the single optional space after ':' is removed, not payload whitespace.
					data.push(field.startsWith(" ") ? field.slice(1) : field);
				}
				line = "";
			}
		}
	} finally {
		if (!completed) await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}
