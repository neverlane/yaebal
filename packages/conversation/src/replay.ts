import {
	type AfterHook,
	type Api,
	type BeforeHook,
	type CallOptions,
	type Composer,
	type Context,
	Context as ContextClass,
	type ErrorHook,
	type Plugin,
	type Update,
	type UpdateName,
} from "@yaebal/core";
import type { StorageAdapter } from "@yaebal/sklad";
import { ConversationHalt, ConversationTimeoutError } from "./errors.js";
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
	RawWait,
} from "./types.js";
import { buildConversation } from "./wait.js";

interface SerializedError {
	name: string;
	message: string;
}

type LogEntry =
	| { kind: "update"; update: Update; updateType: UpdateName }
	| { kind: "api"; result: unknown }
	| { kind: "apiError"; error: SerializedError }
	| { kind: "external"; value: unknown };

/** the whole durable footprint of a conversation — must stay json-serializable. */
interface ReplayState {
	name: string;
	params: unknown;
	startedAt: number;
	lastActivityAt: number;
	log: LogEntry[];
}

function serializeError(error: unknown): SerializedError {
	if (error instanceof Error) return { name: error.name, message: error.message };
	return { name: "Error", message: String(error) };
}

function reviveError(serialized: SerializedError): Error {
	const error = new Error(serialized.message);
	error.name = serialized.name;
	return error;
}

function nonDeterminism(expected: string, got: string): Error {
	return new Error(
		`conversation: durable replay expected ${expected} but the recorded log has "${got}" next — ` +
			"the builder isn't deterministic (every side effect must go through ctx/cv.external(), " +
			"never branch on outside state) or its code changed shape since this conversation started.",
	);
}

/** walks a persisted log forward; once it runs out, every further step is "at the frontier" — real work, appended once, never replayed twice. */
class ReplayCursor {
	private position = 0;
	readonly appended: LogEntry[] = [];

	constructor(private readonly log: readonly LogEntry[]) {}

	get atFrontier(): boolean {
		return this.position >= this.log.length;
	}

	private next(): LogEntry {
		const entry = this.log[this.position];
		this.position++;
		if (!entry) throw new Error("conversation: replay cursor ran past the end of its own log");
		return entry;
	}

	takeUpdate(): { update: Update; updateType: UpdateName } {
		const entry = this.next();
		if (entry.kind !== "update") throw nonDeterminism("wait()", entry.kind);
		return entry;
	}

	takeApi(): { result: unknown } | { error: SerializedError } {
		const entry = this.next();
		if (entry.kind === "api") return { result: entry.result };
		if (entry.kind === "apiError") return { error: entry.error };
		throw nonDeterminism("an api call", entry.kind);
	}

	takeExternal(): unknown {
		const entry = this.next();
		if (entry.kind !== "external") throw nonDeterminism("cv.external()", entry.kind);
		return entry.value;
	}

	record(entry: LogEntry): void {
		this.appended.push(entry);
	}
}

/** wraps a real `Api` so every call replays from the cursor while catching up on history, and runs (and is recorded) for real once past the frontier. */
function makeTrackingApi(realApi: Api, cursor: ReplayCursor): Api {
	const call = async <T>(
		method: string,
		params?: Record<string, unknown>,
		callOptions?: CallOptions,
	): Promise<T> => {
		if (!cursor.atFrontier) {
			const outcome = cursor.takeApi();
			if ("error" in outcome) throw reviveError(outcome.error);
			return outcome.result as T;
		}

		try {
			const result = await realApi.call<T>(method, params, callOptions);
			cursor.record({ kind: "api", result });
			return result;
		} catch (error) {
			cursor.record({ kind: "apiError", error: serializeError(error) });
			throw error;
		}
	};

	const registrar: Record<string, unknown> = {
		call,
		fileUrl: (path: string) => realApi.fileUrl(path),
		// not tracked — a raw byte fetch, not a Bot API call. wrap with cv.external() if a durable
		// builder needs it, so it's recorded/replayed like any other non-deterministic work.
		downloadFile: (...args: Parameters<Api["downloadFile"]>) => realApi.downloadFile(...args),
		before: (hook: BeforeHook) => {
			realApi.before(hook);
			return api;
		},
		after: (hook: AfterHook) => {
			realApi.after(hook);
			return api;
		},
		onError: (hook: ErrorHook) => {
			realApi.onError(hook);
			return api;
		},
	};

	const api = new Proxy(registrar, {
		get(obj, prop) {
			if (typeof prop === "symbol" || prop === "then") return Reflect.get(obj, prop);
			if (prop in obj) return obj[prop as keyof typeof obj];

			const method = (params?: Record<string, unknown>) => call(prop as string, params);
			obj[prop as string] = method;
			return method;
		},
	}) as unknown as Api;

	return api;
}

interface TurnOutcome {
	status: "finished" | "error" | "timeout" | "parked" | "rejected";
	result?: unknown;
	error?: unknown;
}

/**
 * the default engine reconstructs state from a `StorageAdapter` log instead of staying parked in
 * memory: on every update the builder is **replayed from scratch** — history is fed back through
 * `wait()`/`cv.external()`/`ctx.api` calls from the log (nothing real happens during replay), and
 * once it catches up to "now" it either parks again (checkpointed and persisted) or finishes.
 * this is what makes a durable conversation survive a restart, at the cost of requiring the
 * builder to be **deterministic** — see the docs' "determinism" section.
 */
export function createReplayEngine<Defs extends ConversationDefs>(
	defs: Defs,
	rawOptions: ConversationOptions<Context>,
): Plugin<Context, { conversation: ConversationControl<Defs> }> {
	const registry = resolveDefs(defs);
	const resolvedOptions = resolveOptions(rawOptions);
	const storage = rawOptions.storage as StorageAdapter<ReplayState>;
	// passthrough: false queues in memory only (unlike the persisted log itself) — a restart while
	// updates are queued (not yet matched by a wait()) drops them; the conversation's own progress
	// (everything already checkpointed by a matching wait()) is unaffected either way.
	const queues = new Map<string, Context[]>();

	async function runTurn(
		state: ReplayState,
		def: AnyConversationDef,
		incomingCtx: Context,
		isFreshEnter: boolean,
	): Promise<TurnOutcome> {
		const cursor = new ReplayCursor(state.log);
		const trackingApi = makeTrackingApi(incomingCtx.api, cursor);

		const reconstruct = (entry: { update: Update; updateType: UpdateName }): Context =>
			new ContextClass({
				api: trackingApi,
				update: entry.update,
				updateType: entry.updateType,
				me: incomingCtx.me,
			});

		let entryCtx: Context;
		if (isFreshEnter) {
			entryCtx = reconstruct({ update: incomingCtx.update, updateType: incomingCtx.updateType });
			cursor.record({ kind: "update", update: entryCtx.update, updateType: entryCtx.updateType });
		} else {
			entryCtx = reconstruct(cursor.takeUpdate());
		}

		let currentCtx = entryCtx;
		const abort = new AbortController();
		let parkResolve!: () => void;
		const parked = new Promise<void>((res) => {
			parkResolve = res;
		});
		const turnState = { frontierOffered: false, rejected: false };

		const raw: RawWait<Context> = {
			async wait(match, timeoutMs) {
				if (!cursor.atFrontier) {
					const ctx = reconstruct(cursor.takeUpdate());
					const ok = match ? await match(ctx) : true;
					if (!ok) {
						throw nonDeterminism(
							"a wait() filter that still matches its own recorded history",
							"a mismatch",
						);
					}
					currentCtx = ctx;
					return ctx;
				}

				if (turnState.frontierOffered || isFreshEnter) {
					// isFreshEnter: the entering update was already handed to the builder as `ctx`, not
					// via wait() — there is no second real update available in this turn.
					// frontierOffered: this turn's one real update was already spent on an earlier wait().
					parkResolve();
					return new Promise<Context>(() => {});
				}
				turnState.frontierOffered = true;

				const effectiveTimeout = timeoutMs ?? resolvedOptions.waitTimeout;
				if (
					effectiveTimeout !== undefined &&
					resolvedOptions.now() - state.lastActivityAt > effectiveTimeout
				) {
					throw new ConversationTimeoutError(effectiveTimeout);
				}

				const matched = match ? await match(incomingCtx) : true;
				if (!matched) {
					turnState.rejected = true;
					parkResolve();
					return new Promise<Context>(() => {});
				}

				const trackedReal = reconstruct({
					update: incomingCtx.update,
					updateType: incomingCtx.updateType,
				});
				cursor.record({
					kind: "update",
					update: trackedReal.update,
					updateType: trackedReal.updateType,
				});
				currentCtx = trackedReal;
				state.lastActivityAt = resolvedOptions.now();
				return trackedReal;
			},
			external: async <T>(fn: () => T | Promise<T>): Promise<T> => {
				if (!cursor.atFrontier) return cursor.takeExternal() as T;
				const value = await fn();
				cursor.record({ kind: "external", value });
				return value;
			},
			get ctx() {
				return currentCtx;
			},
			get signal() {
				return abort.signal;
			},
		};

		const cv = buildConversation(raw);
		if (isFreshEnter)
			resolvedOptions.onEnter?.(entryCtx, { name: state.name, params: state.params });

		const builderPromise = Promise.resolve()
			.then(() => def.builder(cv, entryCtx, state.params))
			.then(
				(result) => ({ status: "finished", result }) as const,
				(error: unknown) => {
					if (error instanceof ConversationHalt) {
						return { status: "finished", result: undefined } as const;
					}
					if (error instanceof ConversationTimeoutError)
						return { status: "timeout", error } as const;
					return { status: "error", error } as const;
				},
			);

		const raced = await Promise.race([
			builderPromise,
			parked.then(() => ({ status: "racing-park" }) as const),
		]);
		abort.abort();

		if (raced.status !== "racing-park") return raced;
		if (turnState.rejected) return { status: "rejected" };

		state.log = [...state.log, ...cursor.appended];
		return { status: "parked" };
	}

	async function finishState(
		key: string,
		state: ReplayState,
		ctx: Context,
		reason: "finish" | "timeout" | "error",
		error: unknown,
		result: unknown,
	): Promise<void> {
		await storage.delete(key);
		resolvedOptions.onLeave?.(ctx, {
			name: state.name,
			params: state.params,
			reason,
			error,
			result,
		});
	}

	/** runs one turn and settles storage/hooks accordingly. */
	async function drive(
		key: string,
		def: AnyConversationDef,
		state: ReplayState,
		ctx: Context,
		isFreshEnter: boolean,
	): Promise<{ consumed: boolean; ended: boolean }> {
		const outcome = await runTurn(state, def, ctx, isFreshEnter);

		switch (outcome.status) {
			case "finished":
				await finishState(key, state, ctx, "finish", undefined, outcome.result);
				return { consumed: true, ended: true };
			case "timeout":
				await finishState(key, state, ctx, "timeout", undefined, undefined);
				return { consumed: true, ended: true };
			case "error":
				await finishState(key, state, ctx, "error", outcome.error, undefined);
				resolvedOptions.onError(outcome.error, ctx, { name: state.name });
				return { consumed: true, ended: true };
			case "parked":
				state.lastActivityAt = resolvedOptions.now();
				await storage.set(key, state);
				return { consumed: true, ended: false };
			case "rejected":
				return { consumed: false, ended: false };
		}
	}

	function enqueueDurable(key: string, ctx: Context, name: string): void {
		const q = queues.get(key) ?? [];
		q.push(ctx);
		if (q.length > resolvedOptions.queueLimit) {
			const dropped = q.shift();
			if (dropped) resolvedOptions.onOverflow?.(dropped, ctx, { name });
		}
		queues.set(key, q);
	}

	async function replaceAndEnter(
		key: string,
		def: AnyConversationDef,
		name: string,
		ctx: Context,
		params: unknown,
	): Promise<void> {
		const existing = await storage.get(key);
		if (existing) {
			await storage.delete(key);
			resolvedOptions.onLeave?.(ctx, {
				name: existing.name,
				params: existing.params,
				reason: "replaced",
				error: undefined,
			});
		}
		queues.delete(key);

		const now = resolvedOptions.now();
		const state: ReplayState = { name, params, startedAt: now, lastActivityAt: now, log: [] };

		// bounded by this one turn (parks at the first wait() or finishes outright) — never by a
		// *later* update, so awaiting this from the handler that called enter() never deadlocks.
		await drive(key, def, state, ctx, true);
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

		return replaceAndEnter(key, def, name, ctx, params);
	}

	async function leaveConversation(key: string | undefined, ctx: Context): Promise<void> {
		if (key === undefined) return;
		const existing = await storage.get(key);
		if (!existing) return;

		await storage.delete(key);
		queues.delete(key);
		resolvedOptions.onLeave?.(ctx, {
			name: existing.name,
			params: existing.params,
			reason: "left",
			error: undefined,
		});
	}

	async function route(ctx: Context, key: string): Promise<boolean> {
		const state = await storage.get(key);
		if (!state) return false;

		const def = requireDef(registry, state.name);
		if (isPassedCommand(ctx, resolvedOptions.passCommands)) return false;

		const queued = queues.get(key);
		if (queued && queued.length > 0) {
			queues.delete(key);
			queued.push(ctx);
			for (const item of queued) {
				const result = await drive(key, def, state, item, false);
				if (result.ended) break;
			}
			return true;
		}

		const result = await drive(key, def, state, ctx, false);
		if (result.consumed) return true;

		if (await resolvePassthrough(resolvedOptions.passthrough, ctx)) return false;
		enqueueDurable(key, ctx, state.name);
		return true;
	}

	interface Holder {
		key: string | undefined;
		state: ReplayState | undefined;
	}
	const holders = new WeakMap<Context, Holder>();

	const plugin = (composer: Composer<Context>) =>
		composer
			.derive(async (ctx) => {
				const key = resolvedOptions.getKey(ctx);
				const state = key !== undefined ? await storage.get(key) : undefined;
				const holder: Holder = { key, state };
				holders.set(ctx, holder);

				const control: ConversationControl<Defs> = {
					// not an `async` function itself: enterConversation() validates (unknown name,
					// keyless update) synchronously and throws immediately when called bare and
					// unawaited — wrapping it in `async (...) => { await ... }` here would silently
					// turn that back into an unhandled rejection, undoing the point of the split.
					enter: ((name: string, params?: unknown) =>
						enterConversation(ctx, name, params).then(async () => {
							holder.state = holder.key !== undefined ? await storage.get(holder.key) : undefined;
						})) as ConversationControl<Defs>["enter"],
					get active() {
						return holder.state !== undefined;
					},
					get current() {
						return holder.state?.name as ConversationName<Defs> | undefined;
					},
					leave: async () => {
						await leaveConversation(holder.key, ctx);
						holder.state = undefined;
					},
					snapshot: () =>
						holder.state
							? {
									name: holder.state.name as ConversationName<Defs>,
									params: holder.state.params,
									startedAt: holder.state.startedAt,
									lastActivityAt: holder.state.lastActivityAt,
								}
							: undefined,
				};

				return { conversation: control };
			})
			.use(async (ctx, next) => {
				const holder = holders.get(ctx);
				const consumed = holder?.key !== undefined ? await route(ctx, holder.key) : false;
				if (!consumed) await next();
			});

	return plugin as Plugin<Context, { conversation: ConversationControl<Defs> }>;
}
