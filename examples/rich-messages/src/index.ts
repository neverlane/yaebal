import { Bot } from "@yaebal/core";
import {
	audio,
	blockquote,
	bold,
	cell,
	details,
	document,
	heading,
	image,
	isTable,
	item,
	link,
	list,
	paragraph,
	rich,
	richMessageToPlainText,
	table,
	thinking,
	video,
} from "@yaebal/rich";

// a focused tour of @yaebal/rich: building blocks/inline marks, sending a
// document, streaming a draft (RichMessageDraft), and reading rich_message back.
//
// pnpm --filter @yaebal/example-rich-messages dev (needs BOT_TOKEN in .env)

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/rich-messages/.env first (copy .env.example)");
	process.exit(1);
}

// a fake "generator" standing in for an LLM stream, so the demo has no external
// dependency. draft.push() is what you'd call once per real token/chunk.
async function* fakeAnswerStream(question: string): AsyncGenerator<string> {
	const words =
		`you asked: "${question}". here is a fake answer, streamed word by word so you can see the draft update live.`.split(
			" ",
		);

	for (const word of words) {
		await new Promise((resolve) => setTimeout(resolve, 120));
		yield `${word} `;
	}
}

const bot = new Bot(token)
	.install(rich())
	.command("start", (ctx) =>
		ctx.sendRichMessage(
			document([
				heading(1, "@yaebal/rich"),
				paragraph(
					"this bot demonstrates ",
					bold("sendRichMessage"),
					" — telegram's block-tree message format. try ",
					bold("/report"),
					", ",
					bold("/ask <question>"),
					", or ",
					bold("/media"),
					".",
				),
				blockquote(
					[paragraph("unlike parse_mode/entities, this is a real document tree.")],
					"the docs",
				),
				paragraph(
					"see ",
					link("https://yaeb.al/docs/plugins/rich", "the plugin docs"),
					" for the full api.",
				),
			]),
		),
	)
	.command("report", (ctx) =>
		ctx.sendRichMessage(
			document([
				heading(2, "weekly report"),
				table(
					[
						[cell("day", { header: true }), cell("messages", { header: true, align: "right" })],
						[cell("mon"), cell("128", { align: "right" })],
						[cell("tue"), cell("342", { align: "right" })],
					],
					{ bordered: true },
				),
				list([
					item(["ship the release"], { checkbox: true, checked: true }),
					item(["write the changelog"], { checkbox: true, checked: false }),
				]),
				details("what changed", [paragraph("full diff omitted for brevity in this demo.")]),
			]),
		),
	)
	.command("media", (ctx) =>
		ctx.sendRichMessage(
			document([
				heading(2, "media blocks"),
				image("https://picsum.photos/seed/yaebal/480/320", { caption: "a random photo" }),
				video("https://www.w3schools.com/html/mov_bbb.mp4", { caption: "a sample video" }),
				audio("https://www.w3schools.com/html/horse.mp3", { caption: "a sample audio track" }),
			]),
		),
	)
	.command("ask", async (ctx) => {
		const question = ctx.args.join(" ").trim();

		if (!question) return ctx.reply("usage: /ask <question>");

		// draft_id just needs to be non-zero and stable for this one streamed answer.
		const draft = ctx.richMessageDraft(Date.now() % 1_000_000 || 1);

		await draft.push(document([thinking("thinking…")]));

		let answer = "";
		for await (const chunk of fakeAnswerStream(question)) {
			answer += chunk;
			await draft.push(document([paragraph(answer)]));
		}

		// required: a draft never persists on its own — commit the final answer.
		await draft.commit(document([paragraph(answer.trim())]));
	})
	.on("message:rich_message", (ctx) => {
		const richMessage = ctx.message?.rich_message;
		if (!richMessage) return;

		const tableCount = richMessage.blocks.filter(isTable).length;

		return ctx.reply(
			`got a rich message back (${tableCount} table block(s)):\n\n${richMessageToPlainText(richMessage)}`,
		);
	})
	.onError((error, ctx) => {
		console.error(`update ${ctx.update.update_id} failed:`, error);
	})
	.onStart(async (info) => {
		await bot.api
			.call("setMyCommands", {
				commands: [
					{ command: "start", description: "show what this bot can do" },
					{ command: "report", description: "table + checklist + details demo" },
					{ command: "media", description: "photo/video/audio blocks demo" },
					{ command: "ask", description: "stream a fake answer via sendRichMessageDraft" },
				],
			})
			.catch(() => {});

		console.log(`@${info.username} is live - DM it /start`);
	});

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

await bot.start();
