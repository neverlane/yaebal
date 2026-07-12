import type { Context } from "@yaebal/core";
import type {
	Conversation,
	FormApi,
	FormChoiceOptions,
	FormConfirmOptions,
	FormIntOptions,
	FormText,
	FormTextOptions,
	StandardIssueLike,
	StandardSchemaLike,
} from "./types.js";

function isSchema<T>(
	parse: object | ((...args: never[]) => unknown),
): parse is StandardSchemaLike<T> {
	return typeof parse === "object" && parse !== null && "~standard" in parse;
}

async function resolveText<C extends Context>(text: FormText<C>, ctx: C) {
	return typeof text === "function" ? await text(ctx) : text;
}

/** builds `cv.form` on top of an already-constructed `cv.waitFor` — one ask/validate/re-ask loop shared by `text`/`int`/`choice`/`confirm` (mirrors `@yaebal/scenes`' `ask()`). */
export function buildForm<C extends Context>(cv: Conversation<C>): FormApi<C> {
	async function ask<T>(options: FormTextOptions<C, T>): Promise<T> {
		const on = options.on ?? "message:text";

		const parseOne = async (
			text: string,
			ctx: C,
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

		await cv.ctx.send(await resolveText(options.question, cv.ctx));

		for (;;) {
			const answer = await cv.waitFor(on, { timeout: options.timeout });
			const text = (answer as unknown as { text?: string }).text ?? "";
			const result = await parseOne(text, answer as unknown as C);

			if (result.ok) return result.value;

			const fallback = result.issues[0]?.message;
			const invalid =
				typeof options.invalid === "function"
					? await options.invalid(result.issues, answer as unknown as C)
					: (options.invalid ??
						fallback ??
						(await resolveText(options.question, answer as unknown as C)));

			await (answer as unknown as C).send(invalid);
		}
	}

	const int = (options: FormIntOptions<C>): Promise<number> =>
		ask<number>({
			...options,
			parse: (text) => {
				const n = Number(text.trim());
				if (!Number.isFinite(n) || !Number.isInteger(n)) return undefined;
				if (options.min !== undefined && n < options.min) return undefined;
				if (options.max !== undefined && n > options.max) return undefined;
				return n;
			},
		});

	const choice = <T extends string>(options: FormChoiceOptions<C, T>): Promise<T> =>
		ask<T>({
			...options,
			parse: (text) => {
				const input = options.caseSensitive ? text.trim() : text.trim().toLowerCase();
				return options.choices.find(
					(choice) => (options.caseSensitive ? choice : choice.toLowerCase()) === input,
				);
			},
		});

	const confirm = (options: FormConfirmOptions<C>): Promise<boolean> =>
		ask<boolean>({
			...options,
			parse: (text) => {
				const input = text.trim().toLowerCase();
				const yes = options.yes ?? ["y", "yes"];
				const no = options.no ?? ["n", "no"];

				if (yes.includes(input)) return true;
				if (no.includes(input)) return false;
				return undefined;
			},
		});

	return { text: ask, int, choice, confirm };
}
