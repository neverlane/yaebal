import { commands } from "@yaebal/commands";
import { pagination } from "@yaebal/pagination";
import { ratelimiter } from "@yaebal/ratelimiter";
import {
	and,
	type Context,
	callbackData,
	createBot,
	filters,
	html,
	InlineKeyboard,
	i18n,
	session,
} from "yaebal";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/commerce-suite/.env first (copy .env.example)");
	process.exit(1);
}

interface Product {
	id: number;
	name: string;
	price: number;
	tag: string;
}

interface CartSession {
	items: Record<number, number>;
}

const products: Product[] = [
	{ id: 1, name: "neon hoodie", price: 79, tag: "drop" },
	{ id: 2, name: "bot api field guide", price: 29, tag: "book" },
	{ id: 3, name: "callback keychain", price: 9, tag: "gear" },
	{ id: 4, name: "typed plugin pass", price: 149, tag: "vip" },
	{ id: 5, name: "edge webhook kit", price: 59, tag: "cloud" },
	{ id: 6, name: "album forge preset", price: 39, tag: "media" },
	{ id: 7, name: "ratelimit shield", price: 19, tag: "ops" },
	{ id: 8, name: "session vault", price: 49, tag: "state" },
];

const locales = {
	en: {
		welcome: "welcome to the yaebal shop. use /catalog, /deal, /cart, /checkout.",
		cart_empty: "your cart is empty.",
		cart_title: "cart",
		added: "added {name}.",
		removed: "removed {name}.",
		locale: "language switched to english.",
		limited: "slow down a bit. the shop is rate-limited per user.",
		items: { one: "{n} item", other: "{n} items" },
	},
	ru: {
		welcome: "добро пожаловать в yaebal shop. используй /catalog, /deal, /cart, /checkout.",
		cart_empty: "корзина пустая.",
		cart_title: "корзина",
		added: "добавлено: {name}.",
		removed: "удалено: {name}.",
		locale: "язык переключен на русский.",
		limited: "помедленнее. магазин ограничивает частоту на пользователя.",
		items: { one: "{n} товар", few: "{n} товара", many: "{n} товаров", other: "{n} товара" },
	},
};

const cartAction = callbackData("cart", { op: String, id: Number });
// menu-only entries: the handlers live on the bot chain below, the / menu (with
// per-locale descriptions) comes from this registry
const menu = commands()
	.add("start", { default: "open the shop", ru: "открыть магазин" })
	.add("catalog", { default: "browse products", ru: "каталог товаров" })
	.add("deal", { default: "show the featured deal", ru: "предложение дня" })
	.add("cart", { default: "show cart", ru: "показать корзину" })
	.add("checkout", { default: "fake checkout", ru: "оформить заказ" })
	.add("lang", { default: "toggle language", ru: "переключить язык" })
	.add("clear", { default: "empty cart", ru: "очистить корзину" })
	.add("help", { default: "show commands", ru: "список команд" });

const catalog = pagination<Product>({
	id: "shop",
	pageSize: 4,
	source: () => products,
	header: (page, pages) => `catalog page ${page + 1}/${pages}`,
	line: (item) => `#${item.id} ${item.name} - $${item.price} (${item.tag})`,
});

const bot = createBot(token)
	.install(
		ratelimiter({
			limit: 8,
			windowMs: 2_000,
			onLimit: (ctx) => ctx.reply("slow down a bit. the shop is rate-limited per user."),
		}),
	)
	.install(session<CartSession>({ initial: () => ({ items: {} }) }))
	.install(i18n({ defaultLocale: "en", locales }))
	.install(catalog.plugin())
	.install(menu.plugin())
	.command("start", (ctx) =>
		ctx.reply(ctx.t("welcome"), {
			reply_markup: new InlineKeyboard()
				.text("catalog", "open:catalog")
				.text("deal", "open:deal")
				.row()
				.text("cart", "open:cart")
				.text("language", "open:lang")
				.build(),
		}),
	)
	.command("catalog", (ctx) => catalog.send(ctx))
	.command("deal", (ctx) => sendDeal(ctx, products[0]))
	.command("cart", (ctx) => ctx.reply(renderCart(ctx.session, ctx.t)))
	.command("checkout", (ctx) => {
		const lines = renderCart(ctx.session, ctx.t);
		if (lines === ctx.t("cart_empty")) return ctx.reply(lines);

		return ctx.reply(`${lines}\n\ncheckout is mocked: no money moved, only types.`);
	})
	.command("lang", async (ctx) => {
		await ctx.changeLanguage(ctx.locale === "ru" ? "en" : "ru");
		return ctx.reply(ctx.t("locale"));
	})
	.command("clear", (ctx) => {
		ctx.session.items = {};
		return ctx.reply("cart cleared.");
	})
	.filter(and(filters.isPrivate, filters.command("help")), (ctx) =>
		ctx.send(
			html`<b>commerce suite commands</b>\n${menu
				.list({ languageCode: ctx.locale })
				.map((c) => `/${c.command} - ${c.description}`)
				.join("\n")}`,
		),
	)
	.callbackQuery(/^open:/, async (ctx) => {
		const action = ctx.callbackQuery.data?.slice("open:".length);
		await ctx.answer();

		if (action === "catalog") return catalog.send(ctx);
		if (action === "deal") return sendDeal(ctx, products[0]);
		if (action === "cart") return ctx.send(renderCart(ctx.session, ctx.t));
		if (action === "lang") {
			await ctx.changeLanguage(ctx.locale === "ru" ? "en" : "ru");
			return ctx.send(ctx.t("locale"));
		}
	})
	.callbackQuery(cartAction.pattern, async (ctx) => {
		const payload = cartAction.unpack(ctx.callbackQuery.data ?? "");
		if (!payload) return;

		const product = products.find((item) => item.id === payload.id);
		if (!product) return ctx.answer("unknown product");

		if (payload.op === "add") {
			ctx.session.items[product.id] = (ctx.session.items[product.id] ?? 0) + 1;
			await ctx.answer(ctx.t("added", { name: product.name }));
		} else {
			const next = Math.max(0, (ctx.session.items[product.id] ?? 0) - 1);
			if (next === 0) delete ctx.session.items[product.id];
			else ctx.session.items[product.id] = next;
			await ctx.answer(ctx.t("removed", { name: product.name }));
		}

		return ctx.send(renderCart(ctx.session, ctx.t));
	})
	.hears(/^#?(\d+)$/, (ctx) => {
		const id = Number(ctx.match[1]);
		return sendDeal(
			ctx,
			products.find((item) => item.id === id),
		);
	})
	.on("message:text", (ctx) => ctx.reply("send /catalog or a product id like 3."))
	.onStart(async (info) => {
		// diff-aware: pushes the default + ru menus only when they changed
		await menu.sync(bot.api).catch(() => {});
		console.log(`@${info.username} commerce suite is live`);
	});

function renderCart(
	session: CartSession,
	t: (key: string, params?: Record<string, unknown>) => string,
): string {
	const rows = Object.entries(session.items)
		.map(([id, qty]) => ({ product: products.find((item) => item.id === Number(id)), qty }))
		.filter(
			(row): row is { product: Product; qty: number } => row.product !== undefined && row.qty > 0,
		);

	if (rows.length === 0) return t("cart_empty");

	const totalQty = rows.reduce((sum, row) => sum + row.qty, 0);
	const total = rows.reduce((sum, row) => sum + row.product.price * row.qty, 0);

	return [
		`${t("cart_title")} - ${t("items", { n: totalQty })}`,
		...rows.map((row) => `${row.qty} x ${row.product.name} - $${row.product.price * row.qty}`),
		`total: $${total}`,
	].join("\n");
}

function sendDeal(ctx: Context, product: Product | undefined) {
	if (!product) return ctx.reply("unknown product id.");

	return ctx.reply(`${product.name}\nprice: $${product.price}\ntag: ${product.tag}`, {
		reply_markup: new InlineKeyboard()
			.text("add", cartAction.pack({ op: "add", id: product.id }))
			.text("remove", cartAction.pack({ op: "remove", id: product.id }))
			.build(),
	});
}

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

await bot.start();
