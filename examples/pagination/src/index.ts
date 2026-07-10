import { type PaginationContext, pagination } from "@yaebal/pagination";
import { bold, createBot, field, format, InlineKeyboard, italic } from "yaebal";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/pagination/.env first (copy .env.example)");
	process.exit(1);
}

// ── a fake database ──────────────────────────────────────────────────────────
// deterministic data so every run looks the same; "horror" stays empty on
// purpose — it demonstrates the `empty` state.

const GENRES = ["fantasy", "sci-fi", "poetry", "horror"] as const;
type Genre = (typeof GENRES)[number];

interface Book {
	id: number;
	title: string;
	author: string;
	genre: Genre;
	year: number;
}

const FIRST = ["Glass", "Iron", "Silent", "Burning", "Hollow", "Amber", "Paper", "Winter"];
const SECOND = ["Orchard", "Harbor", "Signal", "Meridian", "Lantern", "Archive", "Compass"];
const AUTHORS = ["a. voronova", "d. liet", "m. okafor", "j. calder", "s. anand", "r. holt"];

const books: Book[] = Array.from({ length: 57 }, (_, i) => ({
	id: i + 1,
	title: `${FIRST[i % FIRST.length]} ${SECOND[(i * 3) % SECOND.length]}`,
	author: AUTHORS[i % AUTHORS.length] ?? "unknown",
	genre: GENRES[i % 3] as Genre, // only the first three genres get books
	year: 1970 + ((i * 7) % 55),
}));

// pretend these are SQL queries — the plugin only ever asks for one page
const db = {
	page: (offset: number, limit: number, genre?: Genre) => {
		const rows = genre ? books.filter((b) => b.genre === genre) : books;
		return Promise.resolve(rows.slice(offset, offset + limit));
	},
	count: (genre?: Genre) =>
		Promise.resolve(genre ? books.filter((b) => b.genre === genre).length : books.length),
};

// ── /books — the whole library ───────────────────────────────────────────────
// lazy source with `count`: fetch + count run in parallel, page totals are
// exact, ⏮/⏭ can jump, and the counter button doubles as a refresh.

const library = pagination<Book>({
	id: "lib",
	pageSize: 6,
	source: {
		fetch: ({ offset, limit }) => db.page(offset, limit),
		count: () => db.count(),
	},
	header: (info) => format`${bold("the library")} — ${info.count} books`,
	line: (b, i) => format`${i + 1}. ${bold(b.title)} — ${italic(b.author)}, ${b.year}`,
	counter: true,
	firstLast: true,
	keyboard: (kb) => kb.row().text("✖ close", "lib:close"),
});

// ── /genres — payload-parameterized lists ────────────────────────────────────
// one instance serves every genre: the genre rides the buttons as a typed
// payload, item buttons open a book card, and `button()` navigates back to the
// exact page the reader came from.

const byGenre = pagination({
	id: "genre",
	pageSize: 5,
	payload: { genre: field.enum(GENRES) },
	source: {
		fetch: ({ offset, limit, payload }) => db.page(offset, limit, payload.genre),
		count: (_ctx, payload) => db.count(payload.genre),
	},
	header: (info) => format`${bold(info.payload.genre)} — page ${info.page + 1}/${info.pages}`,
	empty: (info) => `no ${info.payload.genre} books yet.`,
	item: (b) => ({ label: b.title, id: b.id }),
	columns: 1,
	counter: true,
	onSelect: (ctx, sel) => {
		const book = books.find((b) => b.id === sel.id);
		if (book) return showBookCard(ctx, book, sel.page);
	},
});

/** edit the tapped list into a book card; `button()` morphs it back to the same page. */
// the explicit return type breaks the byGenre → onSelect → showBookCard inference cycle
function showBookCard(
	ctx: PaginationContext,
	book: Book,
	page: number,
): Promise<unknown> | undefined {
	const message = ctx.callbackQuery.message;
	const chatId = ctx.chat?.id;
	if (!message || chatId === undefined) return;

	const card = format`${bold(book.title)}
${italic(book.author)}, ${book.year}
genre: ${book.genre}`;

	return ctx.api.call("editMessageText", {
		chat_id: chatId,
		message_id: message.message_id,
		text: card.text,
		entities: card.entities,
		reply_markup: new InlineKeyboard()
			.add(byGenre.button("« back to the list", { page, payload: { genre: book.genre } }))
			.build(),
		...ctx.businessRouting(),
	});
}

// ── /feed — a personal list ──────────────────────────────────────────────────
// lazy source WITHOUT `count`: the plugin probes limit+1 rows per page, so the
// header shows "page N" until the reader hits the end (then the total appears).
// ownership rides the payload — only the requester can page it, even in groups
// and across bot restarts.

const feed = pagination({
	id: "feed",
	pageSize: 4,
	payload: { owner: Number },
	source: {
		fetch: ({ offset, limit, payload }) => {
			// a per-user slice of the library, just to make feeds differ
			const mine = books.filter((b) => b.id % 3 === payload.owner % 3);
			return Promise.resolve(mine.slice(offset, offset + limit));
		},
	},
	line: (b) => `• ${b.title} (${b.year})`,
	labels: { prev: "‹", next: "›" },
	filter: (ctx, payload) => ctx.from?.id === payload.owner,
	denied: "this feed belongs to someone else",
});

// ── the bot ──────────────────────────────────────────────────────────────────

const bot = createBot(token)
	.install(library.plugin())
	.install(byGenre.plugin())
	.install(feed.plugin())
	.command("start", (ctx) =>
		ctx.reply(
			"paginated lists demo:\n" +
				"/books — lazy source + count, ⏮ ◀ N/M ▶ ⏭, refresh via the counter\n" +
				"/genres — one list per payload, tappable items, back-navigation\n" +
				"/feed — endless probing, private to you (try pressing someone else's buttons)",
		),
	)
	.command("books", (ctx) => library.send(ctx))
	.command("genres", (ctx) =>
		ctx.reply("pick a genre — the menu morphs into that list in place:", {
			reply_markup: new InlineKeyboard()
				.columns(2)
				.add(...GENRES.map((genre) => byGenre.button(genre, { payload: { genre } })))
				.build(),
		}),
	)
	.command("feed", (ctx) => {
		const owner = ctx.from?.id;
		if (owner === undefined) return;
		return feed.send(ctx, { payload: { owner } });
	})
	.callbackQuery("lib:close", async (ctx) => {
		const message = ctx.callbackQuery.message;
		if (message && ctx.chat) {
			await ctx.api.call("deleteMessage", { chat_id: ctx.chat.id, message_id: message.message_id });
		}
		await ctx.answerCallbackQuery();
	})
	.onStart((info) => console.log(`@${info.username} pagination demo is live`));

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

await bot.start();
