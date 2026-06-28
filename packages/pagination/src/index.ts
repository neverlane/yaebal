import { callbackData } from "@yaebal/callback-data";
import type { Context, Plugin } from "@yaebal/core";
import { InlineKeyboard, type InlineKeyboardMarkup } from "@yaebal/keyboard";

export interface PaginationOptions<T> {
	/** unique id — namespaces the callback_data so multiple lists don't clash. */
	id: string;
	/** items per page. defaults to 5. */
	pageSize?: number;
	/** where the items come from (may depend on ctx; may be async). */
	source: (ctx: Context) => T[] | Promise<T[]>;
	/** render one item to a line. */
	line: (item: T, index: number) => string;
	/** optional page header. defaults to "page N/M". */
	header?: (page: number, pages: number) => string;
}

export interface Pagination {
	/** a plugin that handles the prev/next button presses. */
	plugin(): Plugin<Context, Record<never, never>>;
	/** send the list (page 0 by default). */
	send(ctx: Context, page?: number): Promise<unknown>;
}

export function pagination<T>(options: PaginationOptions<T>): Pagination {
	const pageSize = options.pageSize ?? 5;

	// prefix must not contain ":" — callback-data splits on it
	const cd = callbackData(`pg_${options.id}`, { page: Number });

	const view = async (
		ctx: Context,
		page: number,
	): Promise<{ text: string; markup: InlineKeyboardMarkup }> => {
		const items = await options.source(ctx);

		const pages = Math.max(1, Math.ceil(items.length / pageSize));
		const p = Math.min(Math.max(0, page), pages - 1);

		const slice = items.slice(p * pageSize, p * pageSize + pageSize);
		const header = options.header ? options.header(p, pages) : `page ${p + 1}/${pages}`;
		const text = [header, "", ...slice.map((item, i) => options.line(item, p * pageSize + i))].join(
			"\n",
		);

		const kb = new InlineKeyboard();

		if (p > 0) kb.text("◀", cd.pack({ page: p - 1 }));
		if (p < pages - 1) kb.text("▶", cd.pack({ page: p + 1 }));

		return { text, markup: kb.build() };
	};

	return {
		plugin() {
			return (composer) =>
				composer.use(async (ctx, next) => {
					const data = ctx.callbackQuery?.data;
					if (data === undefined || !cd.filter(data)) return next();

					const payload = cd.unpack(data);
					if (!payload) return next();
					await ctx.answerCallbackQuery();

					const message = ctx.callbackQuery?.message;
					const chatId = ctx.chat?.id;
					if (!message || chatId === undefined) return;

					const v = await view(ctx, payload.page);

					await ctx.api.call("editMessageText", {
						chat_id: chatId,
						message_id: message.message_id,
						text: v.text,
						reply_markup: v.markup,
					});
				});
		},
		async send(ctx, page = 0) {
			const v = await view(ctx, page);
			
			return ctx.send(v.text, { reply_markup: v.markup });
		},
	};
}
