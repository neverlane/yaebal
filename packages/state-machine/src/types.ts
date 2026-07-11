import type { Context } from "@yaebal/core";

export type MaybePromise<T> = T | Promise<T>;

/**
 * the record persisted per key. this is the whole durable footprint of a machine: restart the
 * bot with a persistent adapter and the key resumes in the same state, context bag and all.
 * must stay json-serializable (adapters round-trip it).
 */
export interface MachineSnapshot {
	state: string;
	/** the machine's extended-state bag (`ctx.machine.context`). */
	context: unknown;
	/** epoch ms of the last transition; drives the `ttl` option. */
	updatedAt: number;
}

/** a typed event driving a transition. discriminate on `type`, add whatever payload you need. */
export interface MachineEvent {
	type: string;
}

export interface EnterInfo<Event extends MachineEvent = MachineEvent> {
	/** the state transitioned from, or `undefined` on the machine's first activation. */
	from: string | undefined;
	/** the event that caused the transition, or `undefined` on first activation / `reset()`. */
	event: Event | undefined;
}

export interface LeaveInfo<Event extends MachineEvent = MachineEvent> {
	/** the state being transitioned to. */
	to: string;
	/** the event driving the transition. */
	event: Event;
}

export type EnterHandler<
	C extends Context = Context,
	Event extends MachineEvent = MachineEvent,
	MCtx extends object = object,
> = (ctx: MachineContext<C, Event, MCtx>, info: EnterInfo<Event>) => unknown;

export type LeaveHandler<
	C extends Context = Context,
	Event extends MachineEvent = MachineEvent,
	MCtx extends object = object,
> = (ctx: MachineContext<C, Event, MCtx>, info: LeaveInfo<Event>) => unknown;

/** a single transition: where it goes, an optional guard, and optional side effects. */
export interface TransitionDef<
	C extends Context = Context,
	Event extends MachineEvent = MachineEvent,
	MCtx extends object = object,
> {
	/** the state to move to. must be a key of the machine's `states`. */
	target: string;
	/** returning `false` skips this transition — later candidates for the same event are tried. */
	guard?: (ctx: MachineContext<C, Event, MCtx>, event: Event) => MaybePromise<boolean>;
	/** side effects run after `onLeave`, before the target's `onEnter`. */
	actions?: (ctx: MachineContext<C, Event, MCtx>, event: Event) => MaybePromise<void>;
}

/** one state's hooks and the transitions it accepts, keyed by event type. */
export interface StateNodeDef<
	C extends Context = Context,
	Event extends MachineEvent = MachineEvent,
	MCtx extends object = object,
> {
	/** fires whenever this state becomes active — including the machine's first activation. */
	onEnter?: EnterHandler<C, Event, MCtx>;
	/** fires whenever this state is left for another one via a matched transition. */
	onLeave?: LeaveHandler<C, Event, MCtx>;
	on?: {
		[K in Event["type"]]?:
			| TransitionDef<C, Extract<Event, { type: K }>, MCtx>
			| ReadonlyArray<TransitionDef<C, Extract<Event, { type: K }>, MCtx>>;
	};
}

/**
 * a state machine definition. `Event` is the union of typed events it accepts, `MCtx` the
 * extended-state bag — declare both via {@link defineMachine} so `ctx.machine.send` /
 * `ctx.machine.context` are typed.
 */
export interface MachineDef<
	C extends Context = Context,
	Event extends MachineEvent = MachineEvent,
	MCtx extends object = object,
> {
	/** the state a key starts in the first time it's seen (and after `reset()`). */
	initial: string;
	/** build the extended-state bag. re-run on the machine's first activation and on `reset()`. */
	context?: (ctx: C) => MCtx;
	states: Record<string, StateNodeDef<C, Event, MCtx>>;
}

/** the live control — what `ctx.machine` is. one object backs every handler for a request. */
export interface ActiveMachine<
	Event extends MachineEvent = MachineEvent,
	MCtx extends object = object,
> {
	/** the current state's name. */
	readonly state: string;
	/**
	 * the machine's extended-state bag. mutate it freely from `actions`/hooks — it is persisted
	 * after every transition and travels with the snapshot across restarts (keep it
	 * json-serializable).
	 */
	readonly context: MCtx;
	/** is the current state `state`? */
	matches(state: string): boolean;
	/** would `send` with an event of this type find a declared transition (guards unevaluated)? */
	can(type: Event["type"]): boolean;
	/**
	 * dispatch a typed event. tries each transition declared for the current state under
	 * `event.type` in order, skipping any whose `guard` rejects. resolves `true` if a transition
	 * fired, `false` if none matched or every guard rejected — the state is unchanged either way.
	 */
	send(event: Event): Promise<boolean>;
	/** back to `initial`, rebuilding the context bag. fires `onEnter` like the first activation. */
	reset(): Promise<void>;
}

/** the context state hooks, guards and actions receive: the bot context plus the live control. */
export type MachineContext<
	C extends Context = Context,
	Event extends MachineEvent = MachineEvent,
	MCtx extends object = object,
> = C & { machine: ActiveMachine<Event, MCtx> };
