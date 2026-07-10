<script lang="ts">
	import Code from "$lib/Code.svelte";

	const usage = `import { Bot } from "@yaebal/core";
import { session } from "@yaebal/session";
import { InlineKeyboard } from "@yaebal/keyboard";

const bot = new Bot(token)
  .install(session({ initial: () => ({ clicks: 0 }) }))
  .command("menu", (ctx) =>
    ctx.reply("pick one", {
      reply_markup: new InlineKeyboard()
        .text("a", "pick:a")
        .text("b", "pick:b")
        .build(),
    }),
  );`;

	const plugins = [
		["@yaebal/again", "/docs/plugins/again/", "awaited retry on structured retry_after / transient 5xx"],
		["@yaebal/session", "/docs/plugins/session/", "typed sessions: dirty-checked saves, lazy mode, multi-session, ttl fields, migrations"],
		["@yaebal/sklad", "/docs/plugins/sklad/", "zero-dep storage adapters: memory (ttl/lru), redis, sqlite, cloudflare kv, json file"],
		["@yaebal/keyboard", "/docs/plugins/keyboard/", "fluent inline & reply keyboard builders"],
		["@yaebal/callback-data", "/docs/plugins/callback-data/", "typed callback_data pack / unpack"],
		["@yaebal/filters", "/docs/plugins/filters/", "composable, type-narrowing update filters: and / or / not, commands, deep links, media, async"],
		["@yaebal/fmt", "/docs/plugins/fmt/", "`` html`` `` / `` md`` `` tagged templates with auto-escaping"],
		["@yaebal/rich", "/docs/plugins/rich/", "sendRichMessage / sendRichMessageDraft: block builder + streaming drafts"],
		["@yaebal/morda", "/docs/plugins/morda/", "dialogs engine + jsx/hooks (react-for-telegram)"],
		["@yaebal/i18n", "/docs/plugins/i18n/", "typed ctx.t (keys + params), Intl plurals, language_code detection"],
		["@yaebal/scenes", "/docs/plugins/scenes/", "durable wizards: typed state, ask() validation, navigation, sub-scenes, ttl"],
		["@yaebal/onboarding", "/docs/plugins/onboarding/", "declarative first-run tutorials with inline controls"],
		["@yaebal/conversation", "/docs/plugins/conversation/", "await-style multi-step dialogs (coroutine, no replay)"],
		["@yaebal/prompt", "/docs/plugins/prompt/", "ask a question, handle the next message"],
		["@yaebal/router", "/docs/plugins/router/", "file-based routing from a routes/ directory"],
		["@yaebal/toml", "/docs/plugins/toml/", "declarative toml routes with a handler registry"],
		["@yaebal/throttle", "/docs/plugins/throttle/", "priority outbound scheduler with Telegram buckets"],
		["@yaebal/files", "/docs/plugins/files/", "inspect, link, stream and download telegram files"],
		["@yaebal/file-id", "/docs/plugins/file-id/", "parse and re-serialize file_id / file_unique_id strings"],
		["@yaebal/ratelimiter", "/docs/plugins/ratelimiter/", "drop updates from users who spam"],
		["@yaebal/broadcast", "/docs/plugins/broadcast/", "typed broadcast jobs with storage, retry, progress and controls"],
		["@yaebal/panel", "/docs/plugins/panel/", "framework-agnostic operator panel with media, keyboards and events"],
		["@yaebal/web", "/docs/plugins/web/", "webhooks on any runtime — edge, node servers, serverless, fetch frameworks; adapters, sequentialize, dedupe, lifecycle"],
		["@yaebal/runner", "/docs/runner/", "concurrent long-polling for scale"],
		["@yaebal/media-group", "/docs/plugins/media-group/", "collect albums into one handler call or ctx.mediaGroup"],
		["@yaebal/media-cache", "/docs/plugins/media-cache/", "upload once, reuse the file_id — self-heals when telegram rejects it"],
		["@yaebal/split", "/docs/plugins/split/", "long text as multiple messages — entities survive the split"],
		["@yaebal/commands", "/docs/plugins/commands/", "one registry for handlers + the / command menu — localized, scoped, diff-synced"],
		["@yaebal/pagination", "/docs/plugins/pagination/", "paginated lists over any source — lazy fetch, item buttons, typed payload"],
		["@yaebal/preview", "/docs/plugins/preview/", "render telegram-style chats to SVG"],
		["@yaebal/workers", "/docs/workers/", "worker_threads pool to offload CPU-heavy work"],
		["@yaebal/test", "/docs/plugins/test/", "testing utilities — mock api with real hooks & error simulation, update factories for every update kind"],
	];
</script>

<svelte:head>
	<title>plugins — yaebal</title>
</svelte:head>

<h1>plugins</h1>
<p class="lead">
	{plugins.length} first-party plugins. each is a typed composer extension — installing one enriches the context
	type, and its dependencies are checked at compile time.
</p>

<Code code={usage} title="menu.ts" />

<h2>the catalog</h2>
<table>
	<thead>
		<tr><th>package</th><th>what it does</th></tr>
	</thead>
	<tbody>
		{#each plugins as [name, href, desc]}
			<tr>
				<td><a href={href}><code>{name}</code></a></td>
				<td>{desc}</td>
			</tr>
		{/each}
	</tbody>
</table>
