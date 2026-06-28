import type { Step } from "./playground";

export interface Example {
	title: string;
	code: string;
	steps: Step[];
}

export const EXAMPLES: Record<string, Example> = {
	"getting-started": {
		title: "your first bot",
		code: `import { Bot } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);

bot.command("start", (ctx) => ctx.reply("hello 👋"));

bot.on("message:text", (ctx) => {
  console.log("got message:", ctx.text);
  ctx.reply(\`you said: \${ctx.text}\`);
});

bot.onStart((me) => console.log("bot ready"));

bot.start();`,
		steps: [{ user: "/start" }, { user: "hi there" }],
	},
};
