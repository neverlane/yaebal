import type { Composer, Context, Plugin } from "@yaebal/core";
import { ConversationExitedError, ConversationHalt, ConversationTimeoutError } from "./errors.js";
import {
	isPassedCommand,
	requireDef,
	resolveDefs,
	resolveOptions,
	resolvePassthrough,
} from "./routing.js";
import type {
	AnyConversationDef,
	ConversationControl,
	ConversationDefs,
	ConversationName,
	ConversationOptions,
	MaybePromise,
	RawWait,
} from "./types.js";
import { buildConversation } from "./wait.js";

interface Waiter {
	match: ((ctx: Context) => MaybePromise<boolean>) | undefined;
	resolve: (ctx: Context) => void;
	reject: (error: unknown) => void;
	timer?: ReturnType<typeof setTimeout>;
}

interface Session {
	readonly key: string;
	readonly name: string;
	readonly params: unknown;
	readonly startedAt: number;
	lastActivityAt: number;
	current: Context;
	queue: Context[];
	waiter?: Waiter;
	readonly abort: AbortController;
	/** settles once the builder has fully unwound — `enter()` (replacing) and `leave()` await it so a torn-down builder never races a fresh one. */
	readonly done: Promise<void>;
}

/**
 * the default, in-memory engine: the builder is a genuine coroutine — it runs once, detached,
 * and each `wait()` call parks a real JS promise until a matching update arrives. state lives
 * only in memory (and in the builder's own closure), so it does not survive a restart; back
 * `conversation()` with `options.storage` for that (the durable replay engine).
 */
export function createLiveEngine<Defs extends ConversationDefs>(
	defs: Defs,
	rawOptions: ConversationOptions<Context>,
): Plugin<Context, { conversation: ConversationControl<Defs> }> {
	const registry = resolveDefs(defs);
	const resolvedOptions = resolveOptions(rawOptions);
	const sessions = new Map<string, Session>();

	function enqueue(session: Session, ctx: Context): void {
		session.queue.push(ctx);

		if (session.queue.length > resolvedOptions.queueLimit) {
			const dropped = session.queue.shift();
			if (dropped) resolvedOptions.onOverflow?.(dropped, ctx, { name: session.name });
		}
	}

	function finish(
		session: Session,
		reason: "finish" | "timeout" | "error",
		error: unknown,
		result: unknown,
	): void {
		if (sessions.get(session.key) === session) sessions.delete(session.key);
		clearTimeout(session.waiter?.timer);
		resolvedOptions.onLeave?.(session.current, {
			name: session.name,
			params: session.params,
			reason,
			error,
			result,
		});
	}

	/** reject a still-parked `wait()` and abort the session's signal; resolves once its builder has fully unwound. */
	async function cancel(session: Session, reason: "left" | "replaced"): Promise<void> {
		if (sessions.get(session.key) === session) sessions.delete(session.key);

		const error = new ConversationExitedError(reason);
		if (!session.abort.signal.aborted) session.abort.abort(error);

		session.waiter?.reject(error);

		resolvedOptions.onLeave?.(session.current, {
			name: session.name,
			params: session.params,
			reason,
			error: undefined,
		});

		await session.done;
	}

	function makeRawWait(session: Session): RawWait<Context> {
		return {
			wait(match, timeoutMs) {
				if (session.abort.signal.aborted) return Promise.reject(session.abort.signal.reason);

				if (session.waiter) {
					return Promise.reject(
						new Error(
							"conversation: wait() is already pending — don't call wait()/waitFor()/waitUntil() concurrently from the same builder",
						),
					);
				}

				// installed synchronously — before any `await` below — so a *second* wait() call
				// issued back-to-back (e.g. `Promise.all([cv.wait(), cv.wait()])`) sees this and
				// rejects immediately, instead of racing it during the async queue drain.
				const waiter: Waiter = { match, resolve: () => {}, reject: () => {} };
				session.waiter = waiter;

				return new Promise<Context>((resolve, reject) => {
					waiter.resolve = (ctx) => {
						if (session.waiter === waiter) session.waiter = undefined;
						clearTimeout(waiter.timer);
						resolve(ctx);
					};
					waiter.reject = (error) => {
						if (session.waiter === waiter) session.waiter = undefined;
						clearTimeout(waiter.timer);
						reject(error);
					};

					// drain the busy-window queue first: the leading run of entries that don't match
					// this wait's filter is consumed (never re-offered — see ConversationOptions.passthrough).
					(async () => {
						while (session.queue.length > 0) {
							const candidate = session.queue.shift() as Context;
							const matched = match ? await match(candidate) : true;
							if (session.waiter !== waiter) return; // settled by something else meanwhile

							if (matched) {
								session.current = candidate;
								session.lastActivityAt = resolvedOptions.now();
								waiter.resolve(candidate);
								return;
							}
						}

						if (session.waiter !== waiter) return;
						if (session.abort.signal.aborted) {
							waiter.reject(session.abort.signal.reason);
							return;
						}

						const ms = timeoutMs ?? resolvedOptions.waitTimeout;
						if (ms !== undefined) {
							waiter.timer = setTimeout(() => waiter.reject(new ConversationTimeoutError(ms)), ms);
						}
					})();
				});
			},
			external: (fn) => Promise.resolve(fn()),
			get ctx() {
				return session.current;
			},
			get signal() {
				return session.abort.signal;
			},
		};
	}

	/**
	 * registers the session and kicks off the detached builder chain; does **not** wait for it to
	 * finish (see `ConversationControl.enter`'s doc — that's what keeps `enter()` deadlock-free
	 * when called as a bare command-handler return value, which core's `compose()` awaits).
	 */
	function start(
		key: string,
		name: string,
		def: AnyConversationDef,
		enterCtx: Context,
		params: unknown,
	): void {
		const abort = new AbortController();
		const startedAt = resolvedOptions.now();

		let resolveDone!: () => void;
		const done = new Promise<void>((res) => {
			resolveDone = res;
		});

		const session: Session = {
			key,
			name,
			params,
			startedAt,
			lastActivityAt: startedAt,
			current: enterCtx,
			queue: [],
			abort,
			done,
		};
		sessions.set(key, session);

		const cv = buildConversation(makeRawWait(session));

		resolvedOptions.onEnter?.(enterCtx, { name, params });

		Promise.resolve()
			.then(() => def.builder(cv, enterCtx, params))
			.then(
				(result) => finish(session, "finish", undefined, result),
				(error: unknown) => {
					if (error instanceof ConversationHalt) {
						finish(session, "finish", undefined, undefined);
						return;
					}
					if (error instanceof ConversationExitedError) {
						// cancel() already removed the session and fired onLeave ("left"/"replaced").
						return;
					}
					if (error instanceof ConversationTimeoutError) {
						finish(session, "timeout", undefined, undefined);
						return;
					}
					finish(session, "error", error, undefined);
					resolvedOptions.onError(error, session.current, { name });
				},
			)
			.finally(resolveDone);
	}

	async function replaceAndStart(
		key: string,
		name: string,
		def: AnyConversationDef,
		ctx: Context,
		params: unknown,
	): Promise<void> {
		const existing = sessions.get(key);
		if (existing) await cancel(existing, "replaced");

		start(key, name, def, ctx, params);
	}

	/**
	 * validates synchronously (unknown name, keyless update) so a bare, unawaited
	 * `ctx.conversation.enter("x")` — the recommended calling style — throws immediately at the
	 * call site instead of surfacing as an unhandled promise rejection; only the actual
	 * replace-then-start work is async.
	 */
	function enterConversation(ctx: Context, name: string, params: unknown): Promise<void> {
		const def = requireDef(registry, name);

		const key = resolvedOptions.getKey(ctx);
		if (key === undefined) {
			throw new Error(
				"conversation: no session key for this update — the default getKey needs ctx.chat/ctx.from; pass options.getKey to enter conversations from keyless updates (inline queries, …)",
			);
		}

		return replaceAndStart(key, name, def, ctx, params);
	}

	async function leaveConversation(key: string | undefined): Promise<void> {
		if (key === undefined) return;
		const existing = sessions.get(key);
		if (existing) await cancel(existing, "left");
	}

	async function offer(session: Session, ctx: Context): Promise<boolean> {
		if (isPassedCommand(ctx, resolvedOptions.passCommands)) return false;

		if (session.waiter) {
			const waiter = session.waiter;
			const matched = waiter.match ? await waiter.match(ctx) : true;

			// the waiter may have already settled (e.g. a timeout fired) while we awaited an async
			// match predicate — treat this update as arriving while busy instead of double-resolving.
			if (session.waiter !== waiter) {
				enqueue(session, ctx);
				return true;
			}

			if (matched) {
				session.current = ctx;
				session.lastActivityAt = resolvedOptions.now();
				waiter.resolve(ctx);
				return true;
			}

			if (await resolvePassthrough(resolvedOptions.passthrough, ctx)) return false;

			enqueue(session, ctx);
			return true;
		}

		// the builder is busy (mid-`await`, not parked in a wait() call) — always queue, so
		// ordering is preserved for whichever wait()/waitFor() it calls next.
		enqueue(session, ctx);
		return true;
	}

	// carries the key resolved once in `derive` to the routing `use` below it, so `getKey` never
	// runs twice for the same update (it may be an arbitrary, possibly expensive, user function).
	const keys = new WeakMap<Context, string | undefined>();

	const plugin = (composer: Composer<Context>) =>
		composer
			.derive((ctx) => {
				const key = resolvedOptions.getKey(ctx);
				keys.set(ctx, key);

				const control: ConversationControl<Defs> = {
					enter: ((name: string, params?: unknown) =>
						enterConversation(ctx, name, params)) as ConversationControl<Defs>["enter"],
					get active() {
						return key !== undefined && sessions.has(key);
					},
					get current() {
						return key !== undefined
							? (sessions.get(key)?.name as ConversationName<Defs> | undefined)
							: undefined;
					},
					leave: () => leaveConversation(key),
					snapshot: () => {
						const session = key !== undefined ? sessions.get(key) : undefined;
						return session
							? {
									name: session.name as ConversationName<Defs>,
									params: session.params,
									startedAt: session.startedAt,
									lastActivityAt: session.lastActivityAt,
								}
							: undefined;
					},
				};

				return { conversation: control };
			})
			.use(async (ctx, next) => {
				const key = keys.get(ctx);
				const session = key !== undefined ? sessions.get(key) : undefined;
				const consumed = session ? await offer(session, ctx) : false;

				if (!consumed) await next();
			});

	return plugin as Plugin<Context, { conversation: ConversationControl<Defs> }>;
}
