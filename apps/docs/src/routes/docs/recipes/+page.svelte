<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const GH = "https://github.com/neverlane/yaebal/tree/master/examples";

	const quick = `# run a production-shaped recipe
cp examples/webhook-edge/.env.example examples/webhook-edge/.env
pnpm --filter @yaebal/example-webhook-edge dev

# run the no-network test recipe
pnpm --filter @yaebal/example-testing-lab test`;

	const mini = `bot.command("app", (ctx) =>
  ctx.reply("open the app", {
    reply_markup: new InlineKeyboard()
      .webApp("open app", "https://example.com/app")
      .build(),
  }));
// validate init data on your backend before trusting the user id.`;

	const recipes = [
		["bare-core bot", "core-echo", "middleware, filter narrowing, format, raw typed api.call — no generated contexts"],
		["shop bot", "commerce-suite", "session cart, i18n, pagination, typed callbacks, command menu, inbound ratelimit"],
		["wizard and support bot", "dialog-quest", "morda cockpit, scenes wizard, prompt and await-style conversation"],
		["media studio bot", "media-studio", "album batching, file links, media cache, svg previews, long reports"],
		["file-routed bot", "modular-router", "commands and update handlers loaded from a routes directory"],
		["webhook bot", "webhook-edge", "fetch handler, secret token, local node adapter and optional setWebhook"],
		["scale bot", "runner-workers", "concurrent polling with per-chat ordering and worker thread offload"],
		["testable bot", "testing-lab", "composer factory plus actor tests for buttons, sessions and api calls"],
		["inline search bot", "inline-search", "inline query answers, offsets and chosen-result analytics"],
		["payments and stars bot", "payments-stars", "telegram stars invoice, pre-checkout, successful payment and refund"],
		["admin panel bot", "panel", "live support dashboard with media viewer and outgoing replies"],
		["broadcast bot", "broadcast", "typed jobs, pause, resume, cancel, retry and progress"],
		["ai rich streaming bot", "rich-messages", "rich document blocks and draft streaming"],
		["mini app bot", "mini-app", "HMAC + Ed25519 initData validation, Authorization: tma backend, answerWebAppQuery"],
		["scheduled jobs bot", "cron", "cron expressions with per-job tz, retries, catch-up via a persisted store, ops commands"],
		["product analytics bot", "analytics", "typed event catalog, autoTrack, ctx.identify, multiple adapters, ops commands"],
		["gradual rollout bot", "feature-flags", "percentage rollout, kill-switch, chat-type targeting, multivariate flags, ops commands"],
		["stateful order bot", "state-machine", "typed events driving transitions, guards, per-state onEnter hooks"],
		["admin-only bot", "guards", "safe guard + getChatMember pattern, membership caching, anonymous admin/owner checks"],
		["session-backed bot", "session", "dirty-checked saves, file storage, ttl fields, migrations"],
		["paginated list bot", "pagination", "lazy sources, item buttons with onSelect, menu morphing and back-navigation"],
	];
</script>

<svelte:head><title>recipes — yaebal</title></svelte:head>

<h1>recipes</h1>
<p class="lead">standalone bot patterns you can copy into a new project and then harden for production.</p>

<Code code={quick} lang="sh" title="terminal" />

<h2>recipe matrix</h2>
<table>
	<thead>
		<tr><th>recipe</th><th>example</th><th>what to copy</th></tr>
	</thead>
	<tbody>
		{#each recipes as [label, example, notes]}
			<tr>
				<td>{label}</td>
				<td><a href={`${GH}/${example}`}>{example}</a></td>
				<td>{notes}</td>
			</tr>
		{/each}
	</tbody>
</table>

<h2>bare-core bot</h2>
<p>
	use <a href={`${GH}/core-echo`}>core-echo</a> when you want the honest, unassisted style:
	<code>@yaebal/core</code> with no generated contexts, raw typed <code>api.call</code>, and
	filter-narrowed middleware. it's the example that mirrors <a href="/docs/core/">core concepts</a>
	most closely.
</p>

<h2>shop bot</h2>
<p>
	use <a href={`${GH}/commerce-suite`}>commerce-suite</a> when you need a catalog, cart, locale switch,
	paginated lists and typed buttons in one bot. it is the fastest copy point for business workflows.
</p>

<h2>wizard and support bot</h2>
<p>
	use <a href={`${GH}/dialog-quest`}>dialog-quest</a> when a bot has menus plus multi-step flows. the
	example shows which problems fit morda, scenes, prompt and conversation.
</p>
<Try id="wizard-form" title="wizard.ts" />
<Try id="conversation-prompt" title="prompt.ts" />

<h2>media studio bot</h2>
<p>
	use <a href={`${GH}/media-studio`}>media-studio</a> for album intake, telegram file links, cached sends,
	generated svg previews and reports that exceed one telegram message.
</p>

<h2>file-routed bot</h2>
<p>
	use <a href={`${GH}/modular-router`}>modular-router</a> when one index file stops scaling. route files
	under <code>src/routes/commands</code> and <code>src/routes/on</code> are loaded at startup and
	registered on the bot, and the command menu is synced with telegram.
</p>

<h2>webhook and scale bot</h2>
<p>
	use <a href={`${GH}/webhook-edge`}>webhook-edge</a> for fetch-style webhooks and
	<a href={`${GH}/runner-workers`}>runner-workers</a> for high-throughput polling with cpu work moved out
	of the handler thread.
</p>

<h2>testable bot</h2>
<p>
	use <a href={`${GH}/testing-lab`}>testing-lab</a> when the bot needs real tests. it exports a composer
	factory, drives it with user actors and asserts outgoing api calls without touching telegram.
</p>

<h2>inline search bot</h2>
<p>
	use <a href={`${GH}/inline-search`}>inline-search</a> for inline mode. it answers generated article
	results, pages with <code>next_offset</code>, and logs chosen results.
</p>
<Try id="inline-mode" title="inline-search.ts" />

<h2>payments and stars bot</h2>
<p>
	use <a href={`${GH}/payments-stars`}>payments-stars</a> for telegram stars: invoice creation,
	pre-checkout approval, successful payment handling and refunds.
</p>
<Try id="payments-stars" title="payments.ts" />

<h2>admin panel bot</h2>
<p>
	use <a href={`${GH}/panel`}>panel</a> for a browser operator dashboard with avatars, media previews,
	callbacks, outgoing replies, uploads and audit events.
</p>

<h2>broadcast bot</h2>
<p>
	use <a href={`${GH}/broadcast`}>broadcast</a> when one bot messages many chats: users subscribe, an
	admin queues a typed job, then pauses, resumes, cancels or retries it while watching progress.
	production notes live on <a href="/docs/production/queues-broadcasts/">queues and broadcasts</a>.
</p>
<Try id="broadcast-queue" title="broadcast.ts" />

<h2>ai rich streaming bot</h2>
<p>
	use <a href={`${GH}/rich-messages`}>rich-messages</a> to stream model output into telegram rich
	messages while keeping the grammar constrained.
</p>
<Try id="rich-ai" title="ai-rich.ts" />
<p>pair <a href="/docs/plugins/rich/">@yaebal/rich</a> with <a href="/docs/llms/">llm guidance</a>.</p>

<h2>mini app bot</h2>
<p>
	use <a href={`${GH}/mini-app`}>mini-app</a> for telegram mini apps: HMAC and Ed25519 initData
	validation, an <code>Authorization: tma</code> backend, <code>answerWebAppQuery</code>, and both
	direct-link and attachment-menu launch flows.
</p>
<Code code={mini} title="mini-app.ts" />
<p>see <a href="/docs/telegram/mini-apps/">mini apps</a>.</p>

<h2>scheduled jobs bot</h2>
<p>
	use <a href={`${GH}/cron`}>cron</a> for anything time-driven: intervals, 6-field cron expressions
	with per-job timezones, retries with backoff, and catch-up runs after downtime via a persisted
	store.
</p>
<Try id="cron-digest" title="cron-digest.ts" />
<Try id="cron-admin" title="cron-admin.ts" />

<h2>product analytics bot</h2>
<p>
	use <a href={`${GH}/analytics`}>analytics</a> for a typed event catalog, automatic
	command/callback/message tracking, and pluggable adapters for wherever the events end up.
</p>
<Try id="analytics-track" title="analytics-track.ts" />
<Try id="analytics-admin" title="analytics-admin.ts" />

<h2>gradual rollout bot</h2>
<p>
	use <a href={`${GH}/feature-flags`}>feature-flags</a> for percentage rollouts, kill switches,
	chat-type targeting and multivariate (A/B/n) flags with per-bucket overrides.
</p>
<Try id="feature-flags-variants" title="feature-flags.ts" />

<h2>stateful order bot</h2>
<p>
	use <a href={`${GH}/state-machine`}>state-machine</a> when a bot's flow is best modeled as typed
	events driving transitions, with a guard you can trip interactively and per-state hooks.
</p>
<Try id="state-machine-order" title="state-machine.ts" />

<h2>admin-only bot</h2>
<p>
	use <a href={`${GH}/guards`}>guards</a> for the safe pattern: <code>guard</code> +
	<code>getChatMember</code>, cached membership checks, and telling anonymous admins/owners apart
	from regular members.
</p>
<Try id="guards-private" title="guards.ts" />

<h2>session-backed bot</h2>
<p>
	use <a href={`${GH}/session`}>session</a> for session v2 in depth: dirty-checked saves so
	untouched state costs nothing, file storage, independent sessions keyed by chat vs. user, ttl
	fields and migrations.
</p>
<Try id="session-v2" title="session.ts" />

<h2>paginated list bot</h2>
<p>
	use <a href={`${GH}/pagination`}>pagination</a> for lazy-loaded lists: a count + limit+1 probe
	instead of loading everything, item buttons with typed <code>onSelect</code> payloads, and
	back-navigation that morphs the same message.
</p>
<Try id="pagination-list" title="pagination.ts" />

<p>the full runnable example list lives on <a href="/docs/examples/">examples</a>.</p>
