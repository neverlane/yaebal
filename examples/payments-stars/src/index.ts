import { type Context, callbackData, createBot, InlineKeyboard } from "yaebal";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/payments-stars/.env first (copy .env.example)");
	process.exit(1);
}

const planData = callbackData("plan", { id: String, stars: Number });
interface Plan {
	id: string;
	title: string;
	stars: number;
}

const plans = [
	{ id: "tip", title: "tip jar", stars: 1 },
	{ id: "pro", title: "pro month", stars: 25 },
	{ id: "ship", title: "ship mode", stars: 100 },
] as const satisfies readonly Plan[];

const bot = createBot(token, {
	allowedUpdates: ["message", "callback_query", "pre_checkout_query"],
})
	.command("start", (ctx) =>
		ctx.reply("choose a telegram stars plan:", {
			reply_markup: plans
				.reduce(
					(keyboard, plan) =>
						keyboard
							.text(
								`${plan.title} - ${plan.stars} stars`,
								planData.pack({ id: plan.id, stars: plan.stars }),
							)
							.row(),
					new InlineKeyboard(),
				)
				.build(),
		}),
	)
	.command("buy", (ctx) => sendInvoice(ctx, plans[0]))
	.command("refund", async (ctx) => {
		const chargeId = ctx.args[0];
		const userId = ctx.from?.id;
		if (!chargeId || userId === undefined)
			return ctx.reply("usage: /refund telegram_payment_charge_id");

		await ctx.refundStarPayment({ user_id: userId, telegram_payment_charge_id: chargeId });
		return ctx.reply("refund requested.");
	})
	.callbackQuery(planData.pattern, async (ctx) => {
		const payload = planData.unpack(ctx.callbackQuery.data ?? "");
		const plan = plans.find((item) => item.id === payload?.id) ?? plans[0];
		await ctx.answer(`invoice: ${plan.title}`);
		return sendInvoice(ctx, plan);
	})
	.on("pre_checkout_query", (ctx) => ctx.answer(true))
	.on("message:successful_payment", (ctx) => {
		const payment = ctx.successful_payment;
		return ctx.reply(
			`payment ok: ${payment?.total_amount ?? 0} ${payment?.currency ?? "xtr"}\ncharge: ${payment?.telegram_payment_charge_id ?? "unknown"}`,
		);
	})
	.onStart(async (info) => {
		await bot.api
			.call("setMyCommands", {
				commands: [
					{ command: "start", description: "choose stars plan" },
					{ command: "buy", description: "send default invoice" },
					{ command: "refund", description: "refund stars payment" },
				],
			})
			.catch(() => {});
		console.log(`@${info.username} payments stars is live`);
	});

function sendInvoice(ctx: Context, plan: Plan) {
	const chatId = ctx.chat?.id;
	if (chatId === undefined) return ctx.reply("no chat in this update.");

	return ctx.api.call("sendInvoice", {
		chat_id: chatId,
		title: plan.title,
		description: `demo invoice for ${plan.title}`,
		payload: `plan:${plan.id}`,
		provider_token: "",
		currency: "XTR",
		prices: [{ label: plan.title, amount: plan.stars }],
		start_parameter: `stars_${plan.id}`,
	});
}

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

await bot.start();
