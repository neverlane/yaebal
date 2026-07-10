import { type MessagePort, parentPort, type Transferable } from "node:worker_threads";
import {
	type ErrMessage,
	isPoolMessage,
	type OkMessage,
	type ReadyMessage,
	type RunMessage,
	serializeError,
	unwrapMove,
} from "./protocol.js";
import type { AnyTasks, TaskContext, TaskDefinitions, TaskHandlers } from "./types.js";

let registered = false;

/**
 * call once inside a worker file: declares the tasks this worker serves and signals the pool
 * it's ready. handlers get `(arg, { signal })` — reject promptly when `signal` fires and the
 * worker survives an abort/timeout instead of being killed.
 */
export function register<Tasks extends TaskDefinitions = AnyTasks>(
	handlers: TaskHandlers<Tasks>,
): void {
	if (!parentPort) {
		throw new Error("register() must be called inside a worker thread (guard with isWorkerThread)");
	}
	if (registered) {
		throw new Error("register() was already called in this worker — pass all tasks in one call");
	}
	registered = true;

	const port = parentPort;
	// null-prototype copy: task lookup can never walk the prototype chain ("constructor", …).
	const tasks: Record<string, (arg: unknown, context: TaskContext) => unknown> = Object.assign(
		Object.create(null),
		handlers,
	);
	const controllers = new Map<number, AbortController>();

	const execute = async ({ id, name, arg }: RunMessage): Promise<void> => {
		const fn = tasks[name];
		if (!fn) {
			const known = Object.keys(tasks).join(", ") || "(none)";
			respondError(
				port,
				id,
				new Error(`unknown task "${name}" — registered: ${known}`),
				"UNKNOWN_TASK",
			);
			return;
		}

		const controller = new AbortController();
		controllers.set(id, controller);

		try {
			const raw = await fn(arg, { signal: controller.signal });
			const { value, transfer } = unwrapMove(raw);
			port.postMessage(
				{ yw: "ok", id, result: value } satisfies OkMessage,
				(transfer ?? []) as Transferable[],
			);
		} catch (error) {
			respondError(port, id, error);
		} finally {
			controllers.delete(id);
		}
	};

	port.on("message", (msg: unknown) => {
		if (!isPoolMessage(msg)) return;
		if (msg.yw === "abort") {
			controllers.get((msg as { id: number }).id)?.abort();
			return;
		}
		if (msg.yw === "run") void execute(msg as RunMessage);
	});

	port.postMessage({ yw: "ready", tasks: Object.keys(tasks) } satisfies ReadyMessage);
}

function respondError(port: MessagePort, id: number, error: unknown, code?: string): void {
	// flatten to plain fields — a live Error/DOMException can degrade to `[object Object]` when
	// structured-cloned across the thread on some Node versions.
	port.postMessage({ yw: "err", id, error: serializeError(error), code } satisfies ErrMessage);
}
