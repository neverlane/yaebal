// a tour of @yaebal/widget: a live poll (typed queries, revisioned shared state, json answers)
// and a TON tip jar (the wallet flow). run: pnpm --filter @yaebal/example-widget dev
import { guardWidgets, toNano, tonTransaction, widgets } from "@yaebal/widget";
import { createBot } from "yaebal";
import { emptyTally, poll, type Tally, tally, vote } from "./poll.ts";
import { AMOUNTS, tip, tipAction } from "./tip.ts";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/widget/.env (see .env.example)");
	process.exit(1);
}
const tonAddress = process.env.TON_ADDRESS;

/** one tally per poll message — a real bot would keep this in @yaebal/session or a database. */
const tallies = new Map<string, Tally>();
/** who already voted where (one vote per user per poll). */
const voters = new Map<string, Set<number>>();

const bot = createBot(token)
	// ctx.widget on every update + an auto-answer, so an unhandled tap never ends in TIMEOUT
	.install(widgets())

	.command("start", (ctx) =>
		ctx.reply("html widgets demo (bot api 10.4): /poll — a live poll, /tip — a TON tip jar"),
	)

	.command("poll", async (ctx) => {
		// message() checks the html against telegram's limits (32 KB / 4 KB compressed) first
		await ctx.sendWidget(await poll.message({ publicData: emptyTally() }));
	})

	.command("tip", async (ctx) => {
		if (!tonAddress) return ctx.reply("set TON_ADDRESS in .env to receive tips");
		await ctx.sendWidget(
			await tip.message({}, { caption: "every tip is verified on-chain before we say thanks" }),
		);
	})

	// a tap on a poll button: ctx.queryData is { option: "pizza" | "sushi" | "tacos" }
	.widgetQuery(vote, async (ctx) => {
		const target = ctx.widget.target;
		if (!target || !("chatId" in target)) return ctx.widget.answer(null);

		const key = `${target.chatId}:${target.messageId}`;
		const seen = voters.get(key) ?? new Set();
		const current = tallies.get(key) ?? emptyTally();
		if (!seen.has(ctx.widgetQuery.from.id)) {
			seen.add(ctx.widgetQuery.from.id);
			current[ctx.queryData.option]++;
			voters.set(key, seen);
			tallies.set(key, current);
			// persist the new tally in the message itself — every viewer redraws from it
			await ctx.widget.setData({ publicData: tally.encode(current) });
		}
		// …and answer with it so the tapping user sees the bars move right away
		await ctx.widget.answer(current);
	})

	// the tip jar's wallet flow — the same action arrives twice, told apart by ctx.widget.kind
	.widgetQuery(tipAction, async (ctx) => {
		if (!tonAddress) return;
		if (ctx.widget.kind === "data") {
			// step 1: the widget asked with { wallet: true } — answer with the transaction to sign
			await ctx.widget.answer(
				tonTransaction({
					messages: [{ address: tonAddress, amount: toNano(ctx.queryData.amount) }],
					validFor: 120,
				}),
			);
			return;
		}
		if (ctx.widget.kind === "sent_transaction") {
			// step 2: the wallet sent it. verify ctx.widget.msgHash on-chain (toncenter, tonapi, …)
			// before delivering anything — this demo only logs it.
			console.log(`tip of ${ctx.queryData.amount} TON from ${ctx.from?.id}: ${ctx.widget.msgHash}`);
			await ctx.widget.answer({ ok: true });
		}
	})

	.onStart(async (info) => {
		// sends from bot.api outside a handler aren't covered by widgets()' per-update guard
		guardWidgets(bot.api);
		await bot.api.setMyCommands({
			commands: [
				{ command: "poll", description: "send a live poll widget" },
				{ command: "tip", description: `a TON tip jar (${AMOUNTS.join(" / ")} TON)` },
			],
		});
		console.log(`@${info.username} is running — send it /poll`);
		const report = await poll.check();
		console.log(
			`poll widget: ${report.size.compressedBytes}/4096 bytes compressed, ${report.issues.length} lint issues`,
		);
	});

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

await bot.start();
