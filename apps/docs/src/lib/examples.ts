import type { Step } from "./playground";

export interface Example {
	title: string;
	code: string;
	steps: Step[];
}

export const EXAMPLES: Record<string, Example> = {
	"getting-started": {
		title: "your first bot",
		code: `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.command("start", (ctx) => ctx.reply("hello from yaebal"));

bot.on("message:text", (ctx) => {
  console.log("got message:", ctx.text);
  ctx.reply(\`you said: \${ctx.text}\`);
});

bot.onStart((me) => console.log("bot ready"));

bot.start();`,
		steps: [{ user: "/start" }, { user: "hi there" }],
	},
	"keyboard-callback": {
		title: "typed inline buttons",
		code: `import { InlineKeyboard, callbackData, createBot } from "yaebal";

const choice = callbackData("choice", { value: String });
const bot = createBot(process.env.BOT_TOKEN!);

bot.command("start", (ctx) =>
  ctx.reply("pick a path", {
    reply_markup: new InlineKeyboard()
      .text("ship it", choice.pack({ value: "ship" }))
      .text("wait", choice.pack({ value: "wait" }))
      .build(),
  }),
);

bot.callbackQuery(choice.pattern, async (ctx) => {
  const data = choice.unpack(ctx.callbackQuery.data ?? "");
  await ctx.answer(data?.value === "ship" ? "shipping" : "holding");
  await ctx.editText(\`status: \${data?.value ?? "unknown"}\`);
});

bot.start();`,
		steps: [{ user: "/start" }, { click: "choice:ship", label: "ship it" }],
	},
	"callback-spinner": {
		title: "answer callback queries first",
		code: `import { InlineKeyboard, createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.command("start", (ctx) =>
  ctx.reply("deploy to production?", {
    reply_markup: new InlineKeyboard().text("confirm", "confirm:deploy").build(),
  }),
);

bot.callbackQuery(/^confirm:/, async (ctx) => {
  await ctx.answerCallbackQuery(); // answer first so the client spinner stops
  await ctx.reply("confirmed");
});

bot.start();`,
		steps: [{ user: "/start" }, { click: "confirm:deploy", label: "confirm" }],
	},
	"session-counter": {
		title: "typed session state",
		code: `import { createBot, session } from "yaebal";

type Session = { count: number };

const bot = createBot(process.env.BOT_TOKEN!)
  .install(session<Session>({ initial: () => ({ count: 0 }) }));

bot.command("count", async (ctx) => {
  ctx.session.count += 1;
  await ctx.reply(\`count: \${ctx.session.count}\`);
});

bot.hears("reset", async (ctx) => {
  ctx.session.count = 0;
  await ctx.reply("count reset");
});

bot.start();`,
		steps: [{ user: "/count" }, { user: "/count" }, { user: "reset" }, { user: "/count" }],
	},
	"session-v2": {
		title: "sessions: per-user keys, ttl fields, clearSession",
		code: `import { clearSession, createBot, keyBy, session, ttl, unwrapTtl, type TtlValue } from "yaebal";

type Profile = { visits: number; otp?: TtlValue<string> };

const bot = createBot(process.env.BOT_TOKEN!)
  // one session per *user* (covers groups and inline queries alike)
  .install(session({
    getKey: keyBy.user,
    initial: (): Profile => ({ visits: 0 }),
  }));

bot.command("me", async (ctx) => {
  ctx.session.visits += 1; // unchanged sessions are never written — this one is
  await ctx.reply(\`visit #\${ctx.session.visits}\`);
});

bot.command("otp", async (ctx) => {
  ctx.session.otp = ttl("1234", 60_000); // self-expiring field
  await ctx.reply(\`code \${unwrapTtl(ctx.session.otp)} — valid for a minute\`);
});

bot.command("reset", async (ctx) => {
  await clearSession(ctx); // delete from storage + fresh initial()
  await ctx.reply("state wiped");
});

bot.start();`,
		steps: [{ user: "/me" }, { user: "/me" }, { user: "/otp" }, { user: "/reset" }, { user: "/me" }],
	},
	"fmt-html": {
		title: "safe html formatting",
		code: `import { createBot, html, md } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.command("start", (ctx) =>
  ctx.reply(html\`<b>hello</b>, \${ctx.from?.first_name ?? "friend"}\n<code>no parse_mode needed</code>\`),
);

bot.command("md", (ctx) =>
  ctx.reply(md\`**bold**, *italic*, __underline__ and ~~strike~~\n> a quoted line\`),
);

bot.start();`,
		steps: [{ user: "/start" }, { user: "/md" }],
	},
	"split-long": {
		title: "long messages, split",
		code: `import { bold, createBot, format } from "yaebal";
import { splitter } from "@yaebal/split";

const bot = createBot(process.env.BOT_TOKEN!);

bot.install(splitter({ max: 160 })); // tiny limit so the split is visible here

bot.command("report", (ctx) => {
  const lines = Array.from({ length: 8 }, (_, i) => \`shard \${i}: ok, queue clear, cache warm\`);
  // entities survive the split — the heading stays bold in part one
  return ctx.replyLong(format\`\${bold("nightly report")}\\n\${lines.join("\\n")}\`);
});

bot.start();`,
		steps: [{ user: "/report" }],
	},
	"reply-keyboard": {
		title: "reply keyboard",
		code: `import { Keyboard, createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.command("menu", (ctx) =>
  ctx.reply("choose from the custom keyboard", {
    reply_markup: new Keyboard()
      .text("profile")
      .text("settings")
      .row()
      .text("hide")
      .resized()
      .placeholder("pick an action")
      .build(),
  }),
);

bot.hears("hide", (ctx) => ctx.reply("keyboard hidden", { reply_markup: Keyboard.remove() }));
bot.hears("profile", (ctx) => ctx.reply("profile opened"));

bot.start();`,
		steps: [{ user: "/menu" }, { user: "profile" }, { user: "hide" }],
	},
	"filters-router": {
		title: "filters and feature routes",
		code: `import { Composer, createBot, filters } from "yaebal";

const support = new Composer()
  .filter(filters.regex(/^ticket (.+)$/i), (ctx) =>
    ctx.reply(\`ticket created: \${ctx.match[1]}\`),
  );

const bot = createBot(process.env.BOT_TOKEN!)
  .extend(support)
  .command("help", (ctx) => ctx.reply("send: ticket <subject>"));

bot.start();`,
		steps: [{ user: "/help" }, { user: "ticket refund" }],
	},
	"guards-private": {
		title: "reusable bot.guard() predicates",
		code: `import { createBot } from "yaebal";
import { and } from "@yaebal/filters";
import { isPrivate } from "@yaebal/guards";

const bot = createBot(process.env.BOT_TOKEN!);

bot.guard(isPrivate).command("whoami", (ctx) =>
  ctx.reply(\`private chat — chat.type is narrowed to "\${ctx.chat.type}"\`),
);

bot.filter(and(isPrivate, (ctx) => (ctx.text?.length ?? 0) > 0), (ctx) =>
  ctx.reply(\`hey \${ctx.from?.first_name}, guards compose with @yaebal/filters' and/or/not\`),
);

bot.start();`,
		steps: [{ user: "/whoami" }, { user: "hi" }],
	},
	"media-poll": {
		title: "media and poll",
		code: `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.command("launch", async (ctx) => {
  await ctx.sendPhoto("https://picsum.photos/seed/yaebal/640/360", {
    caption: "release image by url",
  });

  await ctx.sendPoll("ship today?", ["yes", "hold"]);
});

bot.start();`,
		steps: [{ user: "/launch" }],
	},
	"i18n-switch": {
		title: "language switch",
		code: `import { createBot, i18n } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!)
  .install(i18n({
    defaultLocale: "en",
    // inline dicts keep their literal types, so ctx.t gets typed keys;
    // the first locale a user sees is detected from language_code
    locales: {
      en: { hello: "hello", switched: "language: english" },
      es: { hello: "hola", switched: "language: spanish" },
    },
  }));

bot.command("hello", (ctx) => ctx.reply(ctx.t("hello")));
bot.command("lang", async (ctx) => {
  await ctx.changeLanguage(ctx.locale === "en" ? "es" : "en");
  await ctx.reply(ctx.t("switched"));
});

bot.start();`,
		steps: [{ user: "/hello" }, { user: "/lang" }, { user: "/hello" }],
	},
	"inline-mode": {
		title: "inline query answer",
		code: `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.on("inline_query", async (ctx) => {
  const query = ctx.query || "yaebal";

  await ctx.answer([
    {
      type: "article",
      id: "help",
      title: \`help for \${query}\`,
      input_message_content: { message_text: \`search: \${query}\` },
    },
  ], { cache_time: 0 });
});

bot.start();`,
		steps: [{ inline: "docs" }],
	},
	"payments-stars": {
		title: "payments and stars",
		code: `import { InlineKeyboard, createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.command("buy", async (ctx) => {
  await ctx.sendInvoice({
    title: "coffee",
    description: "support the bot with stars",
    payload: "coffee",
    currency: "XTR",
    prices: [{ label: "coffee", amount: 1 }],
    reply_markup: new InlineKeyboard().pay("pay 1 star").build(),
  });
});

bot.on("pre_checkout_query", async (ctx) => {
  if (ctx.invoice_payload !== "coffee") {
    await ctx.answer(false, { error_message: "unknown order" });
    return;
  }

  await ctx.answer(true);
});

bot.start();`,
		steps: [{ user: "/buy" }, { preCheckout: "coffee" }],
	},
	"wizard-form": {
		title: "session-backed wizard",
		code: `import { createBot, session } from "yaebal";

type Wizard = { step: "idle" | "name" | "age"; name?: string };

const bot = createBot(process.env.BOT_TOKEN!)
  .install(session<Wizard>({ initial: () => ({ step: "idle" }) }));

bot.command("register", async (ctx) => {
  ctx.session.step = "name";
  await ctx.reply("what is your name?");
});

bot.on("message:text", async (ctx) => {
  if (ctx.text.startsWith("/")) return;

  if (ctx.session.step === "name") {
    ctx.session.name = ctx.text;
    ctx.session.step = "age";
    await ctx.reply("how old are you?");
    return;
  }

  if (ctx.session.step === "age") {
    ctx.session.step = "idle";
    await ctx.reply(\`saved \${ctx.session.name} (\${ctx.text})\`);
  }
});

bot.start();`,
		steps: [{ user: "/register" }, { user: "linia" }, { user: "21" }],
	},
	"conversation-prompt": {
		title: "one-shot prompt",
		code: `import { createBot } from "yaebal";

const pending = new Map<number, "name">();
const bot = createBot(process.env.BOT_TOKEN!);

bot.command("name", async (ctx) => {
  pending.set(ctx.chat!.id, "name");
  await ctx.reply("what should i call you?");
});

bot.on("message:text", async (ctx) => {
  if (ctx.text.startsWith("/")) return;
  if (pending.get(ctx.chat!.id) !== "name") return;

  pending.delete(ctx.chat!.id);
  await ctx.reply(\`nice to meet you, \${ctx.text}\`);
});

bot.start();`,
		steps: [{ user: "/name" }, { user: "mira" }],
	},
	"broadcast-queue": {
		title: "broadcast queue shape",
		code: `import { createBot } from "yaebal";

const subscribers = new Set<number>([1001, 1002]);
const bot = createBot(process.env.BOT_TOKEN!);

bot.command("join", async (ctx) => {
  subscribers.add(ctx.chat!.id);
  await ctx.reply("subscribed");
});

bot.command("broadcast", async (ctx) => {
  const text = ctx.args.join(" ") || "release is live";

  for (const chatId of subscribers) {
    await ctx.api.call("sendMessage", { chat_id: chatId, text });
  }

  await ctx.reply(\`queued \${subscribers.size} deliveries\`);
});

bot.start();`,
		steps: [{ user: "/join" }, { user: "/broadcast release is live" }],
	},
	"analytics-track": {
		title: "track events from middleware",
		code: `import { createBot } from "yaebal";
import { analytics, consoleAdapter } from "@yaebal/analytics";

const bot = createBot(process.env.BOT_TOKEN!);

// swap consoleAdapter() for postHogAdapter / plausibleAdapter / sqliteAdapter / clickhouseAdapter
bot.install(analytics({ adapters: [consoleAdapter()] }));

bot.command("start", (ctx) => {
  ctx.track("start", { source: "deeplink" });
  return ctx.reply("hello!");
});

bot.on("message:text", (ctx) => {
  ctx.track("message_received", { length: ctx.text.length });
  return ctx.reply(\`you said: \${ctx.text}\`);
});

bot.start();`,
		steps: [{ user: "/start" }, { user: "hi there" }],
	},
	"audit-log-basic": {
		title: "structured logging for updates and api calls",
		code: `import { createBot } from "yaebal";
import { auditLog } from "@yaebal/audit-log";

const bot = createBot(process.env.BOT_TOKEN!);

// default: jsonFormatter + consoleSink() — every update and every api call, as JSON
bot.install(auditLog());

bot.command("start", (ctx) => ctx.reply("hello!"));

bot.start();`,
		steps: [{ user: "/start" }],
	},
	"cache-wrap": {
		title: "memoize a slow lookup",
		code: `import { createBot } from "yaebal";
import { cache } from "@yaebal/cache";

const bot = createBot(process.env.BOT_TOKEN!);
bot.install(cache({ ttl: 60_000 }));

let calls = 0;

bot.command("weather", async (ctx) => {
  // stands in for a slow api call (e.g. ctx.api.getChat) — wrap caches its result
  const forecast = await ctx.cache.wrap("weather:london", async () => {
    calls++;
    return "sunny, 21°C";
  });

  await ctx.reply(\`\${forecast} (fetched \${calls} time(s) so far)\`);
});

bot.start();`,
		steps: [{ user: "/weather" }, { user: "/weather" }],
	},
	"rich-ai": {
		title: "streaming-style edits",
		code: `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.command("ask", async (ctx) => {
  const question = ctx.args.join(" ") || "what is yaebal?";
  const sent = await ctx.reply(\`thinking about: \${question}\`);

  for (const text of ["reading context", "drafting answer", "yaebal keeps types flowing"]) {
    // editing the *sent* message, not ctx's own — so the raw call is the right tool
    await ctx.api.call("editMessageText", {
      chat_id: sent.chat.id,
      message_id: sent.message_id,
      text,
    });
  }
});

bot.start();`,
		steps: [{ user: "/ask why yaebal" }],
	},
	"pagination-list": {
		title: "paginated list (plugin import)",
		code: `import { createBot } from "yaebal";
import { pagination } from "@yaebal/pagination";

const changelog = [
  "0.1 — first light",
  "0.2 — plugins everywhere",
  "0.3 — files and media",
  "0.4 — scenes",
  "0.5 — i18n",
  "0.6 — playground",
];

const releases = pagination({
  id: "rel",
  pageSize: 3,
  source: () => changelog,
  line: (entry) => entry,
  counter: true, // a "N/M" button between ◀ ▶ — pressing it refreshes the page
});

const bot = createBot(process.env.BOT_TOKEN!)
  .install(releases.plugin());

bot.command("releases", (ctx) => releases.send(ctx));

bot.start();`,
		steps: [{ user: "/releases" }, { click: "pg_rel:1", label: "▶" }],
	},
	"pagination-select": {
		title: "items as buttons",
		code: `import { createBot } from "yaebal";
import { pagination } from "@yaebal/pagination";

const products = [
  { id: 11, name: "neon hoodie" },
  { id: 12, name: "field guide" },
  { id: 13, name: "keychain" },
  { id: 14, name: "plugin pass" },
];

const shop = pagination({
  id: "shop",
  pageSize: 2,
  columns: 2,
  source: () => products,
  item: (p) => ({ label: p.name, id: p.id }),
  onSelect: (ctx, sel) =>
    ctx.send(\`you picked #\${sel.id} (from page \${sel.page + 1})\`),
});

const bot = createBot(process.env.BOT_TOKEN!)
  .install(shop.plugin());

bot.command("shop", (ctx) => shop.send(ctx));

bot.start();`,
		steps: [
			{ user: "/shop" },
			{ click: "pgs_shop:0:2:b", label: "neon hoodie" },
			{ click: "pg_shop:1", label: "▶" },
		],
	},
	"scenes-wizard": {
		title: "a typed wizard with validation",
		code: `import { createBot, type Context } from "yaebal";
import { ask, defineScene, scenes } from "@yaebal/scenes";

const register = defineScene<Context, { name: string; age: number }>({
  steps: [
    ask("name", { question: "what is your name?" }),
    ask("age", {
      question: (ctx) => \`nice, \${ctx.scene.state.name}! how old are you?\`,
      parse: (text) => (/^\\d+$/.test(text) ? Number(text) : undefined),
      invalid: "age is a number — try again",
    }),
  ],
  onLeave: (ctx, info) =>
    info.reason === "finish" &&
    ctx.send(\`saved \${ctx.scene.state.name}, \${ctx.scene.state.age} ✨\`),
});

const bot = createBot(process.env.BOT_TOKEN!)
  .install(scenes({ register }));

bot.command("register", (ctx) => ctx.scene.enter("register"));

bot.start();`,
		steps: [{ user: "/register" }, { user: "linia" }, { user: "twenty" }, { user: "21" }],
	},
	"scenes-buttons": {
		title: "wizard steps over inline buttons",
		code: `import { createBot, type Context } from "yaebal";
import { defineScene, scenes } from "@yaebal/scenes";

const quest = defineScene<Context, { klass?: string }>({
  steps: [
    {
      on: ["callback_query:data"], // this step consumes button presses, not text
      handler: async (ctx) => {
        if (ctx.scene.firstTime)
          return ctx.send("choose a class:", {
            reply_markup: { inline_keyboard: [[
              { text: "builder", callback_data: "class:builder" },
              { text: "mage", callback_data: "class:mage" },
            ]] },
          });
        ctx.scene.state.klass = ctx.update.callback_query?.data?.split(":")[1];
        return ctx.scene.next();
      },
    },
  ],
  onLeave: (ctx, info) =>
    info.reason === "finish" && ctx.send(\`class locked: \${ctx.scene.state.klass}\`),
});

const bot = createBot(process.env.BOT_TOKEN!)
  .install(scenes({ quest }));

bot.command("quest", (ctx) => ctx.scene.enter("quest"));

bot.start();`,
		steps: [{ user: "/quest" }, { click: "class:mage", label: "mage" }],
	},
	"webhook-ready": {
		title: "webhook entrypoint",
		code: `import { createBot, webhook } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.command("start", (ctx) => ctx.reply("webhook ready"));

export default {
  fetch: webhook(bot, { secretToken: process.env.WEBHOOK_SECRET ?? "dev" }),
};`,
		steps: [{ user: "/start" }],
	},
};
