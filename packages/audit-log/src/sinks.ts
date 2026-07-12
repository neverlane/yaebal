import type { AuditEvent, AuditSink } from "./types.js";

/** print formatted entries to `console.log`. the default sink. */
export function consoleSink(): AuditSink {
	return {
		write(entry) {
			console.log("[audit-log]", entry);
		},
	};
}

export interface MemorySinkOptions {
	/** oldest entries are dropped once this many are held. default `1000`. */
	limit?: number;
}

/** a bounded in-process ring buffer — for tests (`recordingSink`-style assertions
 * without hand-rolling one) and for a lightweight `/status` endpoint that wants the
 * last N audit entries without standing up a real sink. not durable: gone on restart. */
export interface MemorySink extends AuditSink {
	readonly entries: readonly unknown[];
	readonly events: readonly AuditEvent[];
	clear(): void;
}

export function memorySink(options: MemorySinkOptions = {}): MemorySink {
	const limit = options.limit ?? 1000;
	let entries: unknown[] = [];
	let events: AuditEvent[] = [];

	return {
		get entries() {
			return entries;
		},
		get events() {
			return events;
		},
		write(entry, event) {
			entries.push(entry);
			events.push(event);
			if (entries.length > limit) {
				entries = entries.slice(-limit);
				events = events.slice(-limit);
			}
		},
		clear() {
			entries = [];
			events = [];
		},
	};
}

/** the subset of `node:fs/promises` {@link fileSink} needs — injectable for tests (no
 * real disk I/O) or a non-node runtime with its own filesystem shim. */
export interface FileSinkFs {
	appendFile(path: string, data: string): Promise<void>;
	stat(path: string): Promise<{ size: number }>;
	rename(from: string, to: string): Promise<void>;
	mkdir(path: string): Promise<unknown>;
	dirname(path: string): string;
}

export interface FileSinkOptions {
	/** rotate `path` to `<path>.1` (a single backup — the previous rotation, if any, is
	 * overwritten) once it exceeds this many bytes, checked after each write. default
	 * `10_000_000` (10MB). `0` disables rotation. */
	maxBytes?: number;
	/** injected filesystem, mainly for tests; defaults to a lazy `node:fs/promises` +
	 * `node:path` import (so this module stays loadable — just inert until used — on
	 * runtimes without either). */
	fs?: FileSinkFs;
}

let lazyFs: Promise<FileSinkFs> | undefined;

function resolveFs(): Promise<FileSinkFs> {
	lazyFs ??= Promise.all([import("node:fs/promises"), import("node:path")]).then(
		([fsMod, pathMod]) => ({
			appendFile: (path: string, data: string) => fsMod.appendFile(path, data),
			stat: (path: string) => fsMod.stat(path),
			rename: (from: string, to: string) => fsMod.rename(from, to),
			mkdir: (path: string) => fsMod.mkdir(path, { recursive: true }),
			dirname: pathMod.dirname,
		}),
	);
	return lazyFs;
}

/** append every entry as one JSON line to `path` (JSONL) — one line per event
 * regardless of `formatter` (a non-string entry is `JSON.stringify`d). writes are
 * serialized through an internal queue (append-order, no interleaving, one instance
 * per path — two processes writing the same path will still race each other), the same
 * pattern `@yaebal/sklad`'s file adapter uses. `flush()` awaits the queue draining. */
export function fileSink(path: string, options: FileSinkOptions = {}): AuditSink {
	const maxBytes = options.maxBytes ?? 10_000_000;
	let queue: Promise<unknown> = Promise.resolve();

	const run = <T>(op: () => Promise<T>): Promise<T> => {
		const next = queue.then(op);
		queue = next.catch(() => {});
		return next;
	};

	return {
		write(entry) {
			return run(async () => {
				const fs = options.fs ?? (await resolveFs());
				await fs.mkdir(fs.dirname(path));

				const line = `${typeof entry === "string" ? entry : JSON.stringify(entry)}\n`;
				await fs.appendFile(path, line);

				if (maxBytes > 0) {
					const stat = await fs.stat(path).catch(() => undefined);
					if (stat && stat.size > maxBytes) await fs.rename(path, `${path}.1`).catch(() => {});
				}
			});
		},
		async flush() {
			await queue;
		},
	};
}

export interface BatchSinkOptions {
	/** flush once this many entries are buffered. default `20`. */
	size?: number;
	/** also flush on a timer, in ms, regardless of buffer size. unset: size-triggered
	 * only (draining the remainder is then only guaranteed by `flush()`). the timer is
	 * `unref`'d — it never keeps the process alive on its own. */
	intervalMs?: number;
}

/** buffer entries and forward them to `inner` in batches — for a sink whose backend
 * charges (or chokes) per call rather than per row (a log shipper's HTTP endpoint, a
 * batched db insert). `inner.write` receives each buffered entry individually, called
 * concurrently as one batch; `inner` itself decides how to turn that into one request
 * (e.g. `Promise.all` inside a custom sink, or just accept the per-entry calls as-is
 * over a connection that pipelines them). `flush()` drains the current buffer *and*
 * calls `inner.flush?.()`. */
export function batchSink(inner: AuditSink, options: BatchSinkOptions = {}): AuditSink {
	const size = options.size ?? 20;
	let buffer: Array<{ entry: unknown; event: AuditEvent }> = [];

	const send = async (): Promise<void> => {
		if (buffer.length === 0) return;
		const batch = buffer;
		buffer = [];
		await Promise.all(batch.map(({ entry, event }) => inner.write(entry, event)));
	};

	if (options.intervalMs) {
		const timer = setInterval(() => void send(), options.intervalMs);
		timer.unref?.();
	}

	return {
		write(entry, event) {
			buffer.push({ entry, event });
			return buffer.length >= size ? send() : undefined;
		},
		async flush() {
			await send();
			await inner.flush?.();
		},
	};
}
