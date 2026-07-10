import { type UpdateSink, type WebhookOptions, webhookCallback } from "@yaebal/core";

export interface ServeOptions extends WebhookOptions {
	/** listen port. defaults to 8080. */
	port?: number;
	/** listen hostname. defaults to the runtime's default (usually all interfaces). */
	hostname?: string;
}

/** a running webhook server. `stop()` shuts it down; `url` is where it's listening. */
export interface ServerHandle {
	/** the base url the server is bound to, e.g. `http://localhost:8080`. */
	readonly url: string;
	/** the resolved port (useful when `port: 0` asked the os to pick one). */
	readonly port: number;
	/** stop accepting connections and release the port. */
	stop(): Promise<void>;
}

type FetchHandler = (request: Request) => Promise<Response>;

interface BunServer {
	port: number;
	hostname: string;
	stop(closeActiveConnections?: boolean): void;
}
interface BunRuntime {
	serve(options: { port?: number; hostname?: string; fetch: FetchHandler }): BunServer;
}

interface DenoServer {
	addr: { hostname: string; port: number };
	shutdown(): Promise<void>;
}
interface DenoRuntime {
	serve(options: { port?: number; hostname?: string }, handler: FetchHandler): DenoServer;
}

/**
 * start a standalone webhook server on the current runtime's native http server —
 * **bun**, **deno**, or **node** — and return a handle you can `stop()`.
 *
 *   const server = await serve(bot, { port: 8080, secretToken: process.env.SECRET });
 *   process.once("SIGINT", () => server.stop());
 *
 * on the fetch runtimes (bun/deno) it uses `Bun.serve` / `Deno.serve`; on node it
 * lazily imports `node:http` (so the static module graph stays `node:`-free and
 * edge-loadable) and bridges through the same fetch handler. on an edge platform
 * with no server to own, export `{ fetch: webhook(bot) }` instead.
 */
export async function serve(bot: UpdateSink, options: ServeOptions = {}): Promise<ServerHandle> {
	const handler = webhookCallback(bot, options);
	const port = options.port ?? 8080;
	const runtime = globalThis as { Bun?: BunRuntime; Deno?: DenoRuntime };

	if (runtime.Bun) {
		const server = runtime.Bun.serve({ port, hostname: options.hostname, fetch: handler });
		return {
			url: `http://${server.hostname}:${server.port}`,
			port: server.port,
			stop: async () => server.stop(),
		};
	}

	if (runtime.Deno) {
		const server = runtime.Deno.serve({ port, hostname: options.hostname }, handler);
		return {
			url: `http://${server.addr.hostname}:${server.addr.port}`,
			port: server.addr.port,
			stop: () => server.shutdown(),
		};
	}

	return serveNode(handler, port, options.hostname);
}

/** node backend: dynamic-imported so the package's static graph never touches `node:`. */
async function serveNode(
	handler: FetchHandler,
	port: number,
	hostname: string | undefined,
): Promise<ServerHandle> {
	const [{ createServer }, { toFetchRequest, sendFetchResponse }] = await Promise.all([
		import("node:http"),
		import("@yaebal/core/node"),
	]);

	const server = createServer((req, res) => {
		void (async () => {
			try {
				await sendFetchResponse(await handler(toFetchRequest(req)), res);
			} catch (error) {
				console.error("[yaebal] serve: request failed:", error);
				if (!res.headersSent) res.statusCode = 500;
				res.end();
			}
		})();
	});

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, hostname, () => {
			server.off("error", reject);
			resolve();
		});
	});

	const address = server.address();
	const resolvedPort = typeof address === "object" && address ? address.port : port;

	return {
		url: `http://${hostname ?? "localhost"}:${resolvedPort}`,
		port: resolvedPort,
		stop: () =>
			new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			),
	};
}
