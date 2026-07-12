import { HttpError, TelegramError } from "@yaebal/core";

/** a json-safe, sink-friendly shape for any thrown value — `Error`/`TelegramError`/
 * `HttpError` all serialize to plain data instead of vanishing under `JSON.stringify`
 * (a bare `Error` stringifies to `"{}"`). built by {@link serializeError}. */
export interface SerializedError {
	name: string;
	message: string;
	/** telegram's numeric error code (e.g. `429`), from a {@link TelegramError}. */
	code?: number;
	/** telegram's error description, from a {@link TelegramError}. */
	description?: string;
	/** http status, from an {@link HttpError} (a non-json response — e.g. a proxy 502). */
	status?: number;
	statusText?: string;
	stack?: string;
}

/** normalize any thrown value — `TelegramError`, `HttpError`, a plain `Error`, or a
 * non-Error throw — into a {@link SerializedError} that every sink can serialize and
 * every formatter can render without losing the telegram error code or http status. */
export function serializeError(error: unknown): SerializedError {
	if (error instanceof TelegramError) {
		return {
			name: error.name,
			message: error.message,
			code: error.code,
			description: error.description,
			stack: error.stack,
		};
	}

	if (error instanceof HttpError) {
		return {
			name: error.name,
			message: error.message,
			status: error.status,
			statusText: error.statusText,
			stack: error.stack,
		};
	}

	if (error instanceof Error) {
		return { name: error.name, message: error.message, stack: error.stack };
	}

	return { name: "UnknownError", message: describeUnknown(error) };
}

function describeUnknown(value: unknown): string {
	if (typeof value === "string") return value;

	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

/** a compact one-line rendering of a {@link SerializedError}, keeping the telegram
 * error code / http status that a bare `.message` would drop — used by {@link
 * textFormatter} and {@link chatSink}. */
export function formatError(error: SerializedError): string {
	if (error.code !== undefined) return `${error.code}: ${error.description ?? error.message}`;
	if (error.status !== undefined) return `${error.status} ${error.statusText ?? error.message}`;
	return error.message;
}
