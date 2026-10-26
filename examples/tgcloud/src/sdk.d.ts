/**
 * the slice of telegram serverless this example touches. the real `sdk` exists
 * only inside a tgcloud isolate, so the types live here and the bundler leaves
 * the imports external.
 */
declare module "sdk" {
	interface RunResult<T> {
		rows: T[];
		rowsAffected: number;
		lastInsertRowid: number;
	}

	interface Insert<T> {
		values(row: Record<string, unknown> | Record<string, unknown>[]): Insert<T>;
		onConflictDoUpdate(config: { target: unknown; set: Record<string, unknown> }): Insert<T>;
		returning(): { run(): Promise<T[]> };
		run(): Promise<RunResult<T>>;
	}

	export const db: {
		insert<T>(table: unknown): Insert<T>;
	};

	export const api: {
		[method: string]: (params?: Record<string, unknown>) => Promise<unknown>;
	};
}

declare module "sdk/db" {
	interface Column {
		primaryKey(): Column;
		notNull(): Column;
		default(value: unknown): Column;
	}

	export function integer(_name: string): Column;
	export function table(_name: string, _columns: Record<string, Column>): Record<string, unknown>;
	export function sql(
		_strings: TemplateStringsArray,
		..._values: unknown[]
	): { readonly sql: true };
}
