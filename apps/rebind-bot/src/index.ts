import { autoRetry } from "@yaebal/again";
import { ask, defineScene, scenes } from "@yaebal/scenes";
import { createBot, type Context } from "yaebal";

// kleinanzeigen email-rebind bot: talks to fuckklaz-server (/api/v1/rebinds),
// which drives fk-fast rebind -> the Vision-cloud python driver.
//
//   pnpm install && cp .env.example .env   (fill BOT_TOKEN etc.)
//   pnpm --filter @yaebal/rebind-bot dev
//
// flows:
//   /rebind  — wizard: account email -> password -> new mailbox -> its imap
//              password -> proxy (direct/auto/url) -> submits and polls to the end
//   /status  — /status <job-id>
//   /list    — last 10 jobs

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in apps/rebind-bot/.env first (copy .env.example)");
	process.exit(1);
}

const FK_SERVER = (process.env.FK_SERVER ?? "http://127.0.0.1:7040").replace(/\/$/, "");
const FK_TOKEN = process.env.FK_TOKEN ?? "secret";
const ADMINS = new Set(
	(process.env.ADMIN_CHAT_IDS ?? "")
		.split(",")
		.map((s) => Number(s.trim()))
		.filter((n) => Number.isFinite(n) && n !== 0),
);

type RebindState = {
	email: string;
	password: string;
	new_email: string;
	imap_password: string;
	proxy: string;
};

type Job = {
	id: string;
	email: string;
	new_email: string;
	state: string;
	detail: string;
	created_at: number;
	finished_at: number | null;
};

async function api(path: string, init?: RequestInit): Promise<Response> {
	return fetch(`${FK_SERVER}/api/v1${path}`, {
		...init,
		headers: {
			authorization: `Bearer ${FK_TOKEN}`,
			"content-type": "application/json",
			...init?.headers,
		},
	});
}

function allowed(ctx: Context): boolean {
	if (ADMINS.size === 0) return true;
	const id = ctx.chat?.id ?? ctx.from?.id ?? 0;
	return ADMINS.has(id);
}

const proxyAsk = ask("proxy", {
	question:
		"proxy для выхода?\n" +
		"• direct — с IP сервера\n" +
		"• auto — proxy_gate сам выберет exit\n" +
		"• socks5://user:pass@host:port — явный\n\n(пусто = direct)",
	parse: (text) => {
		const t = text.trim();
		if (t === "" || t === "direct" || t === "auto" || t.includes("://")) return t || "direct";
		return undefined;
	},
	invalid: "нужно: direct, auto или полный URL прокси",
});

const rebindScene = defineScene<Context, RebindState>({
	steps: [
		ask("email", {
			question: "email акка на KA?",
			parse: (t) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.trim()) ? t.trim() : undefined),
			invalid: "это не похоже на email",
		}),
		ask("password", { question: "пароль от акка (KA)?" }),
		ask("new_email", {
			question: "на какой ящик перевязываем? (туда придёт линк подтверждения)",
			parse: (t) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.trim()) ? t.trim() : undefined),
			invalid: "это не похоже на email",
		}),
		ask("imap_password", {
			question: "IMAP-пароль НОВОГО ящика (бот сам достанет линк из него)",
		}),
		proxyAsk,
	],
	onLeave: async (ctx, info) => {
		if (info.reason !== "finish") return;
		const s = ctx.scene.state;
		const r = await api("/rebinds", {
			method: "POST",
			body: JSON.stringify({
				email: s.email,
				password: s.password,
				new_email: s.new_email,
				imap_password: s.imap_password,
				proxy: s.proxy === "direct" ? undefined : s.proxy,
			}),
		});
		if (!r.ok) {
			await ctx.reply(`сервер отказал: HTTP ${r.status} — ${(await r.text()).slice(0, 200)}`);
			return;
		}
		const job = (await r.json()) as Job;
		await ctx.reply(`запущено 🚀 job ${job.id}\n${job.email} → ${job.new_email}\nжду статус…`);
		void poll(ctx, job.id);
	},
});

const TERMINAL = new Set(["done", "failed"]);

async function poll(ctx: Context, id: string): Promise<void> {
	const deadline = Date.now() + 30 * 60_000;
	let last = "";
	while (Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, 20_000));
		try {
			const r = await api(`/rebinds/${id}`);
			if (!r.ok) continue;
			const j = (await r.json()) as Job;
			if (j.state !== last) {
				last = j.state;
				await ctx.reply(`job ${id}: ${j.state}`);
			}
			if (TERMINAL.has(j.state)) {
				await ctx.reply(
					j.state === "done"
						? `✅ перевяз завершён: ${j.email} → ${j.new_email}\nледжер: data/rebinds.csv`
						: `❌ job ${id} failed\n${j.detail || "(деталей нет — смотри лог драйвера)"}`,
				);
				return;
			}
		} catch {
			// server hiccup — keep polling
		}
	}
	await ctx.reply(`⏳ job ${id} ещё работает спустя 30 мин — проверь вручную: /status ${id}`);
}

const bot = createBot(token).install(autoRetry()).install(scenes({ rebind: rebindScene }));

bot.command("start", (ctx) =>
	ctx.send(
		"rebind-бот KA ↔ fuckklaz-server\n\n" +
			"/rebind — мастер перевяза акка на наш ящик\n" +
			"/status <job-id> — статус\n" +
			"/list — последние джобы",
	),
);

bot.command("rebind", (ctx) => {
	if (!allowed(ctx)) return ctx.reply("не твоя очередь, дружок 🚫");
	return ctx.scene.enter("rebind");
});

bot.command("status", async (ctx) => {
	const id = (ctx.args ?? []).join(" ").trim();
	if (!id) return ctx.reply("usage: /status <job-id>");
	const r = await api(`/rebinds/${encodeURIComponent(id)}`);
	if (r.status === 404) return ctx.reply("нет такого job-id");
	if (!r.ok) return ctx.reply(`HTTP ${r.status}`);
	const j = (await r.json()) as Job;
	return ctx.reply(
		`${j.id}\n${j.email} → ${j.new_email}\nstate: ${j.state}${j.detail ? `\n${j.detail}` : ""}`,
	);
});

bot.command("list", async (ctx) => {
	const r = await api("/rebinds");
	if (!r.ok) return ctx.reply(`HTTP ${r.status}`);
	const jobs = (await r.json()) as Job[];
	if (jobs.length === 0) return ctx.reply("джобов пока нет");
	const lines = jobs.slice(0, 10).map((j) => `${j.state.padEnd(6)} ${j.id}  ${j.email} → ${j.new_email}`);
	return ctx.reply(lines.join("\n"));
});

bot.start();
console.log(`rebind-bot up; server=${FK_SERVER}; admins=${ADMINS.size === 0 ? "everyone" : [...ADMINS].join(",")}`);
