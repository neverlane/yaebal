/**
 * runtime guard for generated id fills: some contexts can only *sometimes* provide an id a
 * method requires (e.g. `user_id` from an optional `from`, `chat_id` from a callback query's
 * possibly-inaccessible message). when the update doesn't carry it and the caller didn't pass
 * it, fail with a clear error instead of silently sending a request Telegram will reject.
 */
export function requiredId<T>(value: T | undefined, param: string, method: string): T {
	if (value === undefined) {
		throw new TypeError(
			`${method}(): cannot fill \`${param}\` from this update — pass { ${param}: ... } explicitly`,
		);
	}

	return value;
}
