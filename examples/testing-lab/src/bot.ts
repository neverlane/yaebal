import { callbackData } from "@yaebal/callback-data";
import { Composer, type Context } from "@yaebal/core";
import { InlineKeyboard } from "@yaebal/keyboard";
import { session } from "@yaebal/session";

interface VoteSession {
	votes: Record<string, number>;
}

export const voteData = callbackData("vote", { choice: String });

export function createTestingLabBot() {
	return new Composer<Context>()
		.install(session<VoteSession>({ initial: () => ({ votes: {} }) }))
		.command("start", (ctx) =>
			ctx.reply("testing lab ready. press a button or send /stats.", {
				reply_markup: new InlineKeyboard()
					.text("ship it", voteData.pack({ choice: "ship" }))
					.text("fix it", voteData.pack({ choice: "fix" }))
					.build(),
			}),
		)
		.command("stats", (ctx) => ctx.reply(renderVotes(ctx.session)))
		.callbackQuery(voteData.pattern, async (ctx) => {
			const payload = voteData.unpack(ctx.callbackQuery.data ?? "");
			if (!payload) return ctx.answerCallbackQuery({ text: "bad vote" });

			ctx.session.votes[payload.choice] = (ctx.session.votes[payload.choice] ?? 0) + 1;
			await ctx.answerCallbackQuery({
				text: `${payload.choice}: ${ctx.session.votes[payload.choice]}`,
			});
			await ctx.send(renderVotes(ctx.session));
		})
		.on("message:text", (ctx) => ctx.reply(`echo: ${ctx.text}`));
}

function renderVotes(session: VoteSession): string {
	const rows = Object.entries(session.votes);
	if (rows.length === 0) return "no votes yet.";

	return ["votes", ...rows.map(([choice, count]) => `${choice}: ${count}`)].join("\n");
}
