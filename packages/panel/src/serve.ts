import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";

/** options for the node {@link serve} helper. */
export interface ServeOptions {
	/** port to listen on. */
	port: number;
	/** host/interface to bind. defaults to node's default (all interfaces). */
	host?: string;
	/** invoked once the server is listening. */
	onListen?: (info: { port: number; host?: string }) => void;
}

/** translate a node request into a whatwg `Request` (body streamed for non-GET/HEAD). */
function toRequest(req: IncomingMessage): Request {
	const host = req.headers.host ?? "localhost";
	const url = `http://${host}${req.url ?? "/"}`;

	const method = req.method ?? "GET";
	const hasBody = method !== "GET" && method !== "HEAD";

	return new Request(url, {
		method,
		headers: req.headers as Record<string, string>,
		// node streams are async-iterable, which `Request` accepts as a body source
		body: hasBody ? (req as unknown as ReadableStream) : undefined,
		// required by undici when streaming a request body
		duplex: "half",
	} as RequestInit);
}

/** pipe a whatwg `Response` back out through a node `ServerResponse`. */
async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
	res.writeHead(response.status, Object.fromEntries(response.headers));
	res.end(Buffer.from(await response.arrayBuffer()));
}

/**
 * start a native node `http` server for a fetch-style handler (e.g. {@link panelHandler}).
 * zero third-party deps — just `node:http`. on bun/deno use their built-in `serve` instead.
 *
 * ```ts
 * import { panelHandler } from "@yaebal/panel";
 * import { serve } from "@yaebal/panel/serve";
 * serve(panelHandler(bot.api, store, { token }), { port: 8080 });
 * ```
 */
export function serve(
	handler: (request: Request) => Promise<Response> | Response,
	options: ServeOptions,
): Server {
	const server = createServer((req, res) => {
		Promise.resolve(handler(toRequest(req)))
			.then((response) => writeResponse(res, response))
			.catch(() => {
				if (!res.headersSent) res.writeHead(500);
				res.end("internal error");
			});
	});

	server.listen(options.port, options.host, () => {
		options.onListen?.({ port: options.port, host: options.host });
	});

	return server;
}
