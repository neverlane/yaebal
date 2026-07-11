import type { Composer, Context, Plugin } from "@yaebal/core";
import { MemoryStorage, type StorageAdapter } from "@yaebal/sklad";
import type {
	ActiveMachine,
	MachineContext,
	MachineDef,
	MachineEvent,
	MachineSnapshot,
	StateNodeDef,
	TransitionDef,
} from "./types.js";

export type * from "./types.js";

function validateInitial(def: MachineDef<Context, MachineEvent, object>): void {
	if (!(def.initial in def.states)) {
		throw new Error(`state-machine: initial state "${def.initial}" is not declared in states`);
	}
}

/**
 * identity helper that pins a machine's context (`C`), event union (`Event`) and extended-state
 * bag (`MCtx`) so everything downstream is typed: `ctx.machine.send(event)`,
 * `ctx.machine.context`, transition guards and actions.
 *
 * @example
 * type OrderEvent = { type: "PAY" } | { type: "SHIP" } | { type: "CANCEL" };
 *
 * const order = defineMachine<Context, OrderEvent, { paidAt?: number }>({
 *   initial: "created",
 *   states: {
 *     created: {
 *       on: {
 *         PAY: { target: "paid", actions: (ctx) => { ctx.machine.context.paidAt = Date.now(); } },
 *         CANCEL: { target: "cancelled" },
 *       },
 *     },
 *     paid: {
 *       on: {
 *         SHIP: { target: "shipped", guard: (ctx) => ctx.machine.context.paidAt !== undefined },
 *         CANCEL: { target: "cancelled" },
 *       },
 *     },
 *     shipped: {},
 *     cancelled: {},
 *   },
 * });
 */
export function defineMachine<
	C extends Context = Context,
	Event extends MachineEvent = MachineEvent,
	MCtx extends object = object,
>(def: MachineDef<C, Event, MCtx>): MachineDef<C, Event, MCtx> {
	validateInitial(def as unknown as MachineDef<Context, MachineEvent, object>);
	return def;
}

export interface StateMachineOptions<C extends Context = Context> {
	/** where to persist machine snapshots. defaults to in-memory (lost on restart). */
	storage?: StorageAdapter<MachineSnapshot>;
	/**
	 * storage key for an update. defaults to `chat.id:from.id` — per user *per chat*.
	 * `undefined` = the machine still runs but is never persisted (fresh `initial` state on
	 * every update — useful for keyless updates like inline queries).
	 */
	getKey?: (ctx: C) => string | undefined;
	/**
	 * reset an inactive machine to `initial` this many milliseconds after its last transition.
	 * checked lazily, on the key's next update; no `onLeave` fires for the expired state since
	 * no event drove the reset — only the initial state's `onEnter` (`info.from` set to the
	 * expired state's name).
	 */
	ttl?: number;
	/** clock override, mainly for tests. */
	now?: () => number;
}

const defaultGetKey = (ctx: Context): string | undefined => {
	const chat = ctx.chat?.id;
	if (chat === undefined) return undefined;

	const from = ctx.from?.id;
	return from === undefined ? String(chat) : `${chat}:${from}`;
};

/**
 * state-machine plugin: a declarative finite-state machine backed by `@yaebal/sklad` storage.
 * unlike `@yaebal/scenes`, there are no steps and no explicit `enter()` — a key's machine is
 * always active, starting at `initial` the first time it's seen, and moves only when
 * `ctx.machine.send(event)` matches a transition declared for the current state (optionally
 * gated by a `guard`).
 *
 * `onEnter`/`onLeave` fire on every state's activation/exit — including the very first
 * activation (`onEnter` with `info.from === undefined`) — so side effects (notifying the user,
 * scheduling work) live next to the state they belong to instead of scattered across handlers.
 *
 * concurrency: snapshots are read-modify-write per update, the same caveat as `@yaebal/scenes` —
 * safe under the built-in sequential poll loop and `@yaebal/runner`'s default per-chat lanes;
 * webhook deployments must serialize updates per key themselves.
 */
export function stateMachine<
	C extends Context,
	Event extends MachineEvent = MachineEvent,
	MCtx extends object = object,
>(
	def: MachineDef<C, Event, MCtx>,
	options: StateMachineOptions<C> = {},
): Plugin<C, { machine: ActiveMachine<Event, MCtx> }> {
	validateInitial(def as unknown as MachineDef<Context, MachineEvent, object>);

	const storage = options.storage ?? new MemoryStorage<MachineSnapshot>();
	const getKey = (options.getKey ?? defaultGetKey) as (ctx: Context) => string | undefined;
	const ttl = options.ttl;
	const now = options.now ?? Date.now;

	const requireState = (name: string): StateNodeDef<C, Event, MCtx> => {
		const node = def.states[name];
		if (!node) throw new Error(`state-machine: unknown state "${name}"`);
		return node;
	};

	const plugin = (composer: Composer<Context>) =>
		composer.derive(async (ctx) => {
			if ((ctx as { machine?: unknown }).machine !== undefined) {
				throw new Error(
					"state-machine: already installed on this composer — install one stateMachine() per composer",
				);
			}

			const key = getKey(ctx);
			let snapshot: MachineSnapshot | undefined =
				key !== undefined ? await storage.get(key) : undefined;
			// the state name to report as `info.from` on the next activation — set when the
			// current snapshot is discarded (self-heal / ttl) rather than left via a transition.
			let resetFrom: string | undefined;

			const mctx = ctx as unknown as MachineContext<C, Event, MCtx>;

			const persist = async (): Promise<void> => {
				if (key === undefined || !snapshot) return;
				snapshot.updatedAt = now();
				await storage.set(key, snapshot);
			};

			// self-heal: a snapshot pointing at a state a deploy removed doesn't shadow the key forever.
			if (snapshot && !(snapshot.state in def.states)) {
				resetFrom = snapshot.state;
				snapshot = undefined;
				if (key !== undefined) await storage.delete(key);
			}

			// ttl: an inactive machine resets to `initial` lazily, on the key's next update.
			if (snapshot && ttl !== undefined && now() - snapshot.updatedAt > ttl) {
				resetFrom = snapshot.state;
				snapshot = undefined;
			}

			const fireEnter = async (
				from: string | undefined,
				event: Event | undefined,
			): Promise<void> => {
				if (!snapshot) return;
				const node = requireState(snapshot.state);
				if (node.onEnter) await node.onEnter(mctx, { from, event });
			};

			const activate = async (
				from: string | undefined,
				event: Event | undefined,
			): Promise<void> => {
				snapshot = {
					state: def.initial,
					context: def.context?.(ctx as C) ?? {},
					updatedAt: now(),
				};
				await persist();
				await fireEnter(from, event);
			};

			if (!snapshot) await activate(resetFrom, undefined);

			const active = (): MachineSnapshot => {
				if (!snapshot) throw new Error("state-machine: no active snapshot");
				return snapshot;
			};

			const control: ActiveMachine<Event, MCtx> = {
				get state() {
					return active().state;
				},
				get context() {
					return active().context as MCtx;
				},
				matches(state) {
					return active().state === state;
				},
				can(type) {
					const node = requireState(active().state);
					return node.on?.[type] !== undefined;
				},
				async send(event) {
					const current = active();
					const node = requireState(current.state);
					const raw = node.on?.[event.type as Event["type"]];
					if (!raw) return false;

					const candidates = (Array.isArray(raw) ? raw : [raw]) as ReadonlyArray<
						TransitionDef<C, Event, MCtx>
					>;

					for (const transition of candidates) {
						if (transition.guard && !(await transition.guard(mctx, event))) continue;
						if (!(transition.target in def.states)) {
							throw new Error(
								`state-machine: transition targets unknown state "${transition.target}"`,
							);
						}

						const from = current.state;
						if (node.onLeave) await node.onLeave(mctx, { to: transition.target, event });

						current.state = transition.target;
						if (transition.actions) await transition.actions(mctx, event);
						await persist();
						await fireEnter(from, event);
						return true;
					}

					return false;
				},
				async reset() {
					await activate(active().state, undefined);
				},
			};

			return { machine: control };
		});

	return plugin as Plugin<C, { machine: ActiveMachine<Event, MCtx> }>;
}
