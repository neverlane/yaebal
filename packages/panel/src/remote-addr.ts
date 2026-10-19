/**
 * the socket address `serve()` saw for a request, keyed by the `Request` object itself — a
 * side channel a client can't write to. a request header (the old `x-panel-remote-addr`) can be
 * sent by anyone who reaches the handler directly, which let a client rotate its rate-limit key
 * and guess tokens without limit.
 */
const remoteAddrs = new WeakMap<Request, string>();

export function setRemoteAddr(request: Request, address: string): void {
	remoteAddrs.set(request, address);
}

export function remoteAddrOf(request: Request): string | undefined {
	return remoteAddrs.get(request);
}
