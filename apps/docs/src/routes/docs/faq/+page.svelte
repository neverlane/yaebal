<script lang="ts">
	import { BOT_API_VERSION } from "$lib/api/data.generated";
	import Code from "$lib/Code.svelte";

	const install = `pnpm add yaebal
# or minimal core only:
pnpm add @yaebal/core`;

	const createBot = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);`;

	const adapters = `import { createBot, expressAdapter } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

// works the same for fastify/elysia (fastifyAdapter/elysiaAdapter) and
// serverless (awsLambdaAdapter/azureAdapter/gcfAdapter).
declare const app: { post(path: string, handler: (req: any, res: any) => Promise<void>): void };
app.post("/webhook", expressAdapter(bot, { secretToken: process.env.WEBHOOK_SECRET }));`;

	const faqs = [
		{
			id: "what-is-yaebal",
			q: "what is yaebal?",
			a: "yaebal is a typescript telegram bot api framework built around one invariant: the context type accumulates through the chain. plugins, derive, decorate, and filter queries update what handlers can see without casting.",
		},
		{
			id: "which-package",
			q: "which package should i install?",
			a: "use yaebal for application code — it wires the core engine, generated rich contexts, formatting, keyboard/callback helpers, and the most common plugin exports behind one import. use @yaebal/core when you want the smallest dependency surface or are writing framework-level code.",
		},
		{
			id: "createbot-vs-new-bot",
			q: "why createBot() instead of new Bot()?",
			a: "createBot() installs yaebal's generated rich context factory at runtime, so shortcuts like ctx.react() and update-specific accessors are both typed and actually present. new Bot() is still useful when you want to choose the context factory yourself.",
		},
		{
			id: "runtimes",
			q: "does it support node, bun, deno, and edge runtimes?",
			a: "yes. core is fetch-first and esm-only, with zero runtime dependencies. webhook handlers run anywhere with Request/Response. some optional packages need platform features: file routing needs fs, @yaebal/workers needs worker threads, and the panel's sqlite store needs node — pair the panel with a KV/Redis-backed sklad store instead for edge.",
		},
		{
			id: "esm-only",
			q: "is it esm-only?",
			a: 'yes. use "type": "module", nodenext-style typescript, and explicit .js import specifiers in source when importing local files.',
		},
		{
			id: "express-fastify",
			q: "does it work with express, fastify, or my existing http server?",
			a: "yes — @yaebal/web ships adapters for express, fastify, elysia, and serverless handlers for aws lambda, azure functions, and google cloud functions, plus the plain fetch-style webhook() for everything else.",
		},
		{
			id: "how-plugins-typed",
			q: "how are plugins typed?",
			a: "a plugin is a typed composer extension. if it adds ctx.session, the returned composer knows about it. if it requires another plugin, that requirement is encoded in the input context type, so wrong install order becomes a typescript error.",
		},
		{
			id: "derive-vs-decorate",
			q: "when do i use derive vs decorate?",
			a: "derive for async per-update state (current user, request id, permissions, tenant config); decorate for static values (db client, config, services, helpers, version strings).",
		},
		{
			id: "scenes-conversation-prompt",
			q: "scenes, conversation, or prompt?",
			a: "@yaebal/scenes for a structured multi-step wizard with named state, @yaebal/conversation for an await-style coroutine flow in a handler, @yaebal/prompt to ask one question and consume the next message, @yaebal/onboarding for a first-run product tour.",
		},
		{
			id: "how-to-test",
			q: "how do i test a bot?",
			a: "use @yaebal/test. it gives you virtual users and chats, intercepted bot api calls, fake timers, webhook request helpers, media updates, payments, inline mode, reactions, and callback button interactions — no telegram token needed in ci.",
		},
		{
			id: "how-to-deploy",
			q: "how do i deploy?",
			a: "for small bots, long polling is fine. for serverless or public production, use webhooks. for high-throughput polling, use @yaebal/runner to process updates concurrently while preserving per-chat order.",
		},
		{
			id: "bot-api-version",
			q: "which telegram bot api version does it support?",
			a: `the generated types, contexts, and api reference track Bot API ${BOT_API_VERSION}, built straight from Telegram's published schema. a scheduled job re-runs the generator whenever Telegram ships a new version, so the gap between an upstream release and yaebal picking it up is usually a day, not a manual release cycle.`,
		},
		{
			id: "stability",
			q: "is it stable? what does the version number mean?",
			a: "packages are pre-1.0 and versioned independently. that means occasional breaking changes, always called out in that package's changelog — every release goes through changesets, so nothing bumps silently. pin exact versions in production and read the changelog before upgrading a major plugin.",
		},
		{
			id: "license",
			q: "what license is it under?",
			a: "MIT.",
		},
		{
			id: "where-full-api",
			q: "where is the full bot api?",
			a: "the generated bot api reference includes every method and type from the schema yaebal ships with. method pages show params, return type, official telegram links, and yaebal usage examples.",
		},
		{
			id: "get-help",
			q: "where do i ask a question or report a bug?",
			a: "open an issue or discussion on the github repo — that's the primary channel right now. include a minimal repro; a failing @yaebal/test case is the fastest way to get a fix.",
		},
		{
			id: "the-name",
			q: 'why is it called "yaebal"?',
			a: 'Yet Another tElegram Bot Api Library — a nod to how many telegram bot frameworks already exist (gramio, grammy, puregram, telegraf, …). the name says so upfront instead of pretending yaebal is the first.',
		},
		{
			id: "help-grow",
			q: "how can i help the project grow?",
			a: "star the github repo, ship a small example bot, write a comparison post, share playground links, and open issues when docs or apis are confusing. early frameworks grow through concrete examples more than slogans.",
		},
	];

	const jsonLd = JSON.stringify({
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: faqs.map((f) => ({
			"@type": "Question",
			name: f.q,
			acceptedAnswer: { "@type": "Answer", text: f.a },
		})),
	}).replace(/</g, "\\u003c");
</script>

<svelte:head>
	<title>faq — yaebal</title>
	{@html `<script type="application/ld+json">${jsonLd}<\/script>`}
</svelte:head>

<h1>faq</h1>
<p class="lead">
	short answers to the questions people ask before and after choosing yaebal. Bot API
	{BOT_API_VERSION}.
</p>

<h2 id={faqs[0].id}>{faqs[0].q}</h2>
<p>{faqs[0].a}</p>

<h2 id={faqs[1].id}>{faqs[1].q}</h2>
<Code code={install} title="terminal" lang="sh" />
<p>{faqs[1].a}</p>
<Code code={createBot} title="bot.ts" />

<h2 id={faqs[2].id}>{faqs[2].q}</h2>
<p>{faqs[2].a}</p>

<h2 id={faqs[3].id}>{faqs[3].q}</h2>
<p>
	{faqs[3].a} see <a href="/docs/runtimes/">runtime support</a>.
</p>

<h2 id={faqs[4].id}>{faqs[4].q}</h2>
<p>{faqs[4].a}</p>

<h2 id={faqs[5].id}>{faqs[5].q}</h2>
<p>{faqs[5].a}</p>
<Code code={adapters} title="server.ts" />

<h2 id={faqs[6].id}>{faqs[6].q}</h2>
<p>{faqs[6].a}</p>

<h2 id={faqs[7].id}>{faqs[7].q}</h2>
<table>
	<thead><tr><th>method</th><th>use it for</th></tr></thead>
	<tbody>
		<tr><td><code>derive</code></td><td>async per-update state: current user, request id, permissions, tenant config</td></tr>
		<tr><td><code>decorate</code></td><td>static values: db client, config, services, helpers, version strings</td></tr>
	</tbody>
</table>

<h2 id={faqs[8].id}>{faqs[8].q}</h2>
<table>
	<thead><tr><th>need</th><th>package</th></tr></thead>
	<tbody>
		<tr><td>structured multi-step wizard with named state</td><td><a href="/docs/plugins/scenes/"><code>@yaebal/scenes</code></a></td></tr>
		<tr><td>await-style coroutine flow in a handler</td><td><a href="/docs/plugins/conversation/"><code>@yaebal/conversation</code></a></td></tr>
		<tr><td>ask one question and consume the next message</td><td><a href="/docs/plugins/prompt/"><code>@yaebal/prompt</code></a></td></tr>
		<tr><td>first-run product tour with skip/next controls</td><td><a href="/docs/plugins/onboarding/"><code>@yaebal/onboarding</code></a></td></tr>
	</tbody>
</table>

<h2 id={faqs[9].id}>{faqs[9].q}</h2>
<p>
	use <a href="/docs/plugins/test/"><code>@yaebal/test</code></a>. {faqs[9].a}
</p>

<h2 id={faqs[10].id}>{faqs[10].q}</h2>
<p>
	{faqs[10].a} see <a href="/docs/runner/"><code>@yaebal/runner</code></a>.
</p>

<h2 id={faqs[11].id}>{faqs[11].q}</h2>
<p>{faqs[11].a} see the <a href="/docs/api/">bot api reference</a>.</p>

<h2 id={faqs[12].id}>{faqs[12].q}</h2>
<p>{faqs[12].a}</p>

<h2 id={faqs[13].id}>{faqs[13].q}</h2>
<p>
	{faqs[13].a} see the <a href="https://github.com/neverlane/yaebal/blob/master/LICENSE" target="_blank" rel="noreferrer">license file</a>.
</p>

<h2 id={faqs[14].id}>{faqs[14].q}</h2>
<p>{faqs[14].a}</p>

<h2 id={faqs[15].id}>{faqs[15].q}</h2>
<p>
	<a href="https://github.com/neverlane/yaebal" target="_blank" rel="noreferrer">github repo</a>.
	{faqs[15].a}
</p>

<h2 id={faqs[16].id}>{faqs[16].q}</h2>
<p>{faqs[16].a}</p>

<h2 id={faqs[17].id}>{faqs[17].q}</h2>
<p>{faqs[17].a}</p>
