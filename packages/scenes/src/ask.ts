import type { Context, FilterQuery, FormatResult } from "@yaebal/core";
import type { MaybePromise, SceneContext, StepDef } from "./types.js";

/** one validation failure, in the standard-schema shape. */
export interface StandardIssueLike {
	readonly message: string;
}

/**
 * the standard-schema v1 surface `ask` consumes — implemented by zod (3.24+),
 * valibot, arktype and friends. typed structurally so this package depends on
 * nothing; any object with a conforming `"~standard".validate` works.
 */
export interface StandardSchemaLike<T> {
	readonly "~standard": {
		readonly version: 1;
		readonly validate: (
			value: unknown,
		) => MaybePromise<
			| { readonly value: T; readonly issues?: undefined }
			| { readonly issues: readonly StandardIssueLike[] }
		>;
	};
}

// the step's own key is precisely typed; sibling keys collected by earlier steps
// stay readable (as unknown) so a question can reference them.
type AskCtx<K extends string, T> = SceneContext<
	Context,
	Record<K, T> & Record<string, unknown>,
	unknown
>;

/** a question (or error) text: plain, `format`ted, or computed from the context. */
export type AskText<K extends string, T> =
	| string
	| FormatResult
	| ((ctx: AskCtx<K, T>) => MaybePromise<string | FormatResult>);

export interface AskOptions<K extends string, T> {
	/** sent on the step's question pass (and, by default, re-sent on invalid input). */
	question: AskText<K, T>;
	/**
	 * how to read the answer: a standard-schema (zod/valibot/arktype) validated
	 * against the message text, or a plain parse function returning `undefined`
	 * for invalid input. omitted → any non-empty text (trimmed).
	 */
	parse?:
		| StandardSchemaLike<T>
		| ((text: string, ctx: AskCtx<K, T>) => MaybePromise<T | undefined>);
	/**
	 * sent when the input doesn't parse. a function receives the schema's issues
	 * (empty for parse-function rejections). default: the first issue's message,
	 * falling back to re-asking `question`.
	 */
	invalid?:
		| string
		| FormatResult
		| ((
				issues: readonly StandardIssueLike[],
				ctx: AskCtx<K, T>,
		  ) => MaybePromise<string | FormatResult>);
	/** which updates the step claims. default: fresh text messages. */
	on?: FilterQuery | FilterQuery[];
}

function isSchema<T>(
	parse: NonNullable<AskOptions<string, T>["parse"]>,
): parse is StandardSchemaLike<T> {
	return typeof parse === "object" && "~standard" in parse;
}

async function resolveText<K extends string, T>(
	text: AskText<K, T>,
	ctx: AskCtx<K, T>,
): Promise<string | FormatResult> {
	return typeof text === "function" ? await text(ctx) : text;
}

/**
 * a ready-made "ask one question" step: sends `question` on the first pass,
 * then validates each answer into `ctx.scene.state[key]` and advances. invalid
 * input keeps the user on the step. the step is named after `key`, so
 * `ctx.scene.go("email")` jumps back to it.
 *
 * @example
 * defineScene<Context, { name: string; age: number }>({
 *   steps: [
 *     ask("name", { question: "what's your name?" }),
 *     ask("age", { question: "how old are you?", parse: z.coerce.number().int().min(1) }),
 *   ],
 * });
 */
export function ask<K extends string, T = string>(
	key: K,
	options: AskOptions<K, T>,
): StepDef<Context, Record<K, T> & Record<string, unknown>, unknown> {
	const on = options.on ?? ["message:text", "business_message:text"];

	const parse = async (
		text: string,
		ctx: AskCtx<K, T>,
	): Promise<{ ok: true; value: T } | { ok: false; issues: readonly StandardIssueLike[] }> => {
		if (options.parse === undefined) {
			const trimmed = text.trim();
			// T defaults to string here; an explicit T with no `parse` is a def bug, not our cast.
			if (trimmed === "") return { ok: false, issues: [] };
			return { ok: true, value: trimmed as unknown as T };
		}

		if (isSchema(options.parse)) {
			const result = await options.parse["~standard"].validate(text);
			if (result.issues) return { ok: false, issues: result.issues };
			return { ok: true, value: result.value };
		}

		const value = await options.parse(text, ctx);
		return value === undefined ? { ok: false, issues: [] } : { ok: true, value };
	};

	return {
		name: key,
		on,
		handler: async (ctx) => {
			if (ctx.scene.firstTime) {
				await ctx.send(await resolveText(options.question, ctx));
				return;
			}

			const result = await parse(ctx.text ?? "", ctx);

			if (!result.ok) {
				const fallback = result.issues[0]?.message;
				const invalid =
					typeof options.invalid === "function"
						? await options.invalid(result.issues, ctx)
						: (options.invalid ?? fallback ?? (await resolveText(options.question, ctx)));
				await ctx.send(invalid);
				return; // stay on the step — the next message re-runs it
			}

			(ctx.scene.state as Record<K, T>)[key] = result.value;
			await ctx.scene.next();
		},
	};
}
