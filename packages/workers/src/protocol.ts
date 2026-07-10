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

/**
 * an error flattened to plain, always-cloneable fields. we never ship the live Error/DOMException
 * across the thread: on Node 20 a DOMException (e.g. a DataCloneError) silently degrades to
 * `[object Object]` through structured clone, losing name/message/stack. serialising by hand keeps
 * the message intact on every supported Node.
 */
export interface SerializedError {
	name: string;
	message: string;
	stack?: string;
}

export interface ErrMessage {
	yw: "err";
	id: number;
	/** the thrown error, flattened to always-cloneable fields — see {@link serializeError}. */
	error: SerializedError;
	/** machine-readable marker for protocol-level failures (e.g. "UNKNOWN_TASK"). */
	code?: string;
}

/** flatten any thrown value into a cloneable {@link SerializedError}. */
export function serializeError(value: unknown): SerializedError {
	if (value instanceof Error || isErrorLike(value)) {
		return {
			name: String(value.name ?? "Error"),
			message: String(value.message ?? ""),
			stack: typeof value.stack === "string" ? value.stack : undefined,
		};
	}
	return { name: "Error", message: String(value) };
}

/** covers DOMException and other host error objects that aren't `instanceof Error`. */
function isErrorLike(
	value: unknown,
): value is { name?: unknown; message?: unknown; stack?: unknown } {
	return (
		typeof value === "object" &&
		value !== null &&
		"message" in value &&
		"name" in value &&
		typeof (value as { message?: unknown }).message === "string"
	);
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
