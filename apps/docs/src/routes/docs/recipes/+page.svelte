<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const GH = "https://github.com/neverlane/yaebal/tree/master/examples";

	const quick = `# run a production-shaped recipe
cp examples/webhook-edge/.env.example examples/webhook-edge/.env
pnpm --filter @yaebal/example-webhook-edge dev

# run the no-network test recipe
pnpm --filter @yaebal/example-testing-lab test`;

	const mini = `new InlineKeyboard().webApp("open app", "https://example.com/app");
// validate init data on your backend before trusting the user id.`;

	const recipes = [
		["shop bot", "commerce-suite", "session cart, i18n, pagination, typed callbacks, command menu, inbound ratelimit"],
		["dialog bot", "dialog-quest", "morda cockpit, scenes wizard, prompt and await-style conversation"],
		["media bot", "media-studio", "album batching, file links, media cache, svg previews, long reports"],
		["file-routed bot", "modular-router", "commands and update handlers loaded from a routes directory"],
		["webhook bot", "webhook-edge", "fetch handler, secret token, local node adapter and optional setWebhook"],
		["scale bot", "runner-workers", "concurrent polling with per-chat ordering and worker thread offload"],
		["testable bot", "testing-lab", "composer factory plus actor tests for buttons, sessions and api calls"],
		["inline bot", "inline-search", "inline query answers, offsets and chosen-result analytics"],
		["stars bot", "payments-stars", "telegram stars invoice, pre-checkout, successful payment and refund"],
		["operator bot", "panel", "live support dashboard with media viewer and outgoing replies"],
		["broadcast bot", "broadcast", "typed jobs, pause, resume, cancel, retry and progress"],
		["rich bot", "rich-messages", "rich document blocks and draft streaming"],
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

<h2>mini app bot</h2>
<p>web app buttons, init-data validation, backend handoff and callback confirmation.</p>
<Code code={mini} title="mini-app.ts" />
<p>see <a href="/docs/telegram/mini-apps/">mini apps</a>.</p>

<h2>admin panel bot</h2>
<p>
	use <a href={`${GH}/panel`}>panel</a> for a browser operator dashboard with avatars, media previews,
	callbacks, outgoing replies, uploads and audit events.
</p>

<h2>ai rich streaming bot</h2>
<p>stream model output into telegram rich messages while keeping the grammar constrained.</p>
<Try id="rich-ai" title="ai-rich.ts" />
<p>pair <a href="/docs/plugins/rich/">@yaebal/rich</a> with <a href="/docs/llms/">llm guidance</a>.</p>
