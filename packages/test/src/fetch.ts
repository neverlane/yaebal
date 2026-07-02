/** stub `globalThis.fetch` for the duration of `fn`, restoring the original afterwards (even on throw). */
export async function withFetch<T>(handler: typeof fetch, fn: () => T | Promise<T>): Promise<T> {
	const realFetch = globalThis.fetch;
	globalThis.fetch = handler;

	try {
		return await fn();
	} finally {
		globalThis.fetch = realFetch;
	}
}
