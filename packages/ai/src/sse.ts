/**
 * minimal server-sent-events reader for streaming llm http responses. yields the `data:`
 * payload of every event as a raw string — json parsing (and `[DONE]` sentinels) are the
 * caller's business, they differ per provider.
 */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
	const decoder = new TextDecoder();
	const reader = body.getReader();
	let buffer = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			// events are separated by a blank line; fields inside may span multiple `data:` lines.
			let boundary = buffer.indexOf("\n\n");
			while (boundary !== -1) {
				const rawEvent = buffer.slice(0, boundary);
				buffer = buffer.slice(boundary + 2);

				const data = rawEvent
					.split("\n")
					.filter((line) => line.startsWith("data:"))
					.map((line) => line.slice(5).trimStart())
					.join("\n");
				if (data.length > 0) yield data;

				boundary = buffer.indexOf("\n\n");
			}
		}
	} finally {
		reader.releaseLock();
	}
}
