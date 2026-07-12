/**
 * thrown into a parked `wait()`/`waitFor()`/`waitUntil()` call when the conversation is torn
 * down out from under it — `leave()`, a replacing `enter()`, or (rarely) engine shutdown. a
 * builder that doesn't catch it simply unwinds (its `finally` blocks still run); the plugin
 * treats this as a deliberate exit, not a bug, so it never reaches `onError`.
 */
export class ConversationExitedError extends Error {
	constructor(reason: string) {
		super(`conversation: exited — ${reason}`);
		this.name = "ConversationExitedError";
	}
}

/**
 * thrown into a parked `wait()`/`waitFor()`/`waitUntil()`/`form.*` call once its timeout
 * elapses. catch it inside the builder to handle the timeout yourself (e.g. send a "you took
 * too long" message); left uncaught, it ends the conversation with `onLeave` reason `"timeout"`
 * (not `onError` — a timeout is expected, not a bug).
 */
export class ConversationTimeoutError extends Error {
	constructor(ms: number) {
		super(`conversation: wait() timed out after ${ms}ms`);
		this.name = "ConversationTimeoutError";
	}
}

/**
 * thrown by `cv.halt()` to stop the builder immediately, as if it had `return`ed `undefined`.
 * an internal sentinel — the plugin always catches it before it could reach `onError`. a
 * builder wrapping its own cleanup should use `finally` (which still runs), not a broad `catch`
 * that could swallow this along with real errors.
 */
export class ConversationHalt extends Error {
	constructor() {
		super("conversation: halted");
		this.name = "ConversationHalt";
	}
}
