import { Bot } from "@yaebal/core";
import {
	audio,
	blockquote,
	bold,
	cell,
	details,
	divider,
	document,
	footer,
	heading,
	html,
	image,
	isTable,
	item,
	link,
	list,
	md,
	paragraph,
	rich,
	richMessageToPlainText,
	table,
	thinking,
	video,
} from "@yaebal/rich";

// a focused tour of @yaebal/rich: the dual-dialect builders (every builder works
// in both the html and markdown template), sending a document, streaming a draft
// (RichMessageDraft), and reading rich_message back.
//
// pnpm --filter @yaebal/example-rich-messages dev (needs BOT_TOKEN in .env)

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/rich-messages/.env first (copy .env.example)");
	process.exit(1);
}

// a fake "generator" standing in for an LLM stream, so the demo has no external
// dependency. draft.rewrite() is what you'd call once per real token/chunk.
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
			html`
				${heading(1, "@yaebal/rich")}

				${paragraph(
					"this bot demonstrates ",
					bold("sendRichMessage"),
					" — telegram's block-tree message format. try ",
					bold("/report"),
					", ",
					bold("/md"),
					", ",
					bold("/ask <question>"),
					", or ",
					bold("/media"),
					".",
				)}

				${blockquote(
					[paragraph("unlike parse_mode/entities, this is a real document tree.")],
					"the docs",
				)}

				${paragraph("see ", link("https://yaeb.al/docs/plugins/rich", "the plugin docs"), " for the full api.")}
			`,
		),
	)
	.command("md", (ctx) => {
		// the exact same builders that fed html`…` above also work under md`…` —
		// one builder set, either wire dialect, chosen at the template tag.
		const title = "@yaebal/rich, in markdown";

		return ctx.sendRichMessage(
			md`
				${heading(1, title)}

				${paragraph("same builders, ", bold("different dialect"), " — telegram renders this as markdown.")}

				${list(["dual-dialect builders", "one escaping pass per interpolation", "no duplicated api"])}
			`,
		);
	})
	.command("report", (ctx) =>
		ctx.sendRichMessage(
			document([
				heading(2, "weekly report"),
				table(
					[
						[cell("day", { header: true }), cell("messages", { header: true, align: "right" })],
						[cell("mon"), cell(128, { align: "right" })],
						[cell("tue"), cell(342, { align: "right" })],
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

		// rewrite() replaces the whole draft each time — right for a token stream, where
		// every chunk is a longer version of the *same* growing paragraph.
		await draft.rewrite(document([thinking("thinking…")]));

		let answer = "";
		for await (const chunk of fakeAnswerStream(question)) {
			answer += chunk;
			await draft.rewrite(document([paragraph(answer)]));
		}

		// write() appends without re-supplying what's already there — handy for a
		// trailing block that should follow the streamed answer, not replace it.
		await draft.write(document([divider(), footer("streamed via @yaebal/rich")]));

		// required: a draft never persists on its own. send() with no argument would
		// auto-assemble from the rewrite()/write() calls above; passing an explicit
		// override here trims the trailing whitespace `answer` accumulated.
		await draft.send(
			document([paragraph(answer.trim()), divider(), footer("streamed via @yaebal/rich")]),
		);
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
					{ command: "md", description: "the same builders, rendered as markdown" },
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
