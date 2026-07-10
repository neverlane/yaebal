import type { Transferable } from "node:worker_threads";

/**
 * the wire protocol between the pool (main thread) and register() (worker). every message
 * carries the `yw` discriminant, so pool traffic never collides with the user's own
 * parentPort messages — both sides ignore anything without it.
 */

export interface RunMessage {
	yw: "run";
	id: number;
	name: string;
	arg: unknown;
}

export interface AbortMessage {
	yw: "abort";
	id: number;
}

export interface ReadyMessage {
	yw: "ready";
	/** task names the worker registered — lets the pool fail unknown names without a round-trip. */
	tasks: string[];
}

export interface OkMessage {
	yw: "ok";
	id: number;
	result: unknown;
}

export interface ErrMessage {
	yw: "err";
	id: number;
	/** the thrown Error (structured clone keeps name/message/stack), or a string for exotic values. */
	error: unknown;
	/** machine-readable marker for protocol-level failures (e.g. "UNKNOWN_TASK"). */
	code?: string;
}

export type MainToWorker = RunMessage | AbortMessage;
export type WorkerToMain = ReadyMessage | OkMessage | ErrMessage;

export function isPoolMessage(value: unknown): value is { yw: string; id?: number } {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { yw?: unknown }).yw === "string"
	);
}

const MOVE = Symbol("yaebal.workers.move");

interface Moved {
	[MOVE]: true;
	value: unknown;
	transfer: readonly Transferable[];
}

/**
 * wrap a task result so its transferables move back to the main thread instead of being copied:
 * `return move(bytes, [bytes.buffer])`. typed as the plain value, so handler signatures don't change.
 */
export function move<T>(value: T, transfer: readonly Transferable[]): T {
	return { [MOVE]: true, value, transfer } satisfies Moved as unknown as T;
}

export function unwrapMove(value: unknown): { value: unknown; transfer?: readonly Transferable[] } {
	if (typeof value === "object" && value !== null && (value as Moved)[MOVE] === true) {
		const moved = value as Moved;
		return { value: moved.value, transfer: moved.transfer };
	}
	return { value };
}
