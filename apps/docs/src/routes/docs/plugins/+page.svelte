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
		["@yaebal/cache", "/docs/plugins/cache/", "ctx.cache.get/set/wrap — ttl memoization, stale-while-revalidate, sliding expiry, negative caching, prefix invalidation, typed key catalog"],
		["@yaebal/feature-flags", "/docs/plugins/feature-flags/", "ctx.flags.isEnabled(key)/getVariant(key) — typed boolean & A/B/n flags, telegram-native targeting, global overrides, guard/whenFlag, admin commands, LaunchDarkly/GrowthBook/env adapters"],
		["@yaebal/keyboard", "/docs/plugins/keyboard/", "fluent inline & reply keyboard builders"],
		["@yaebal/callback-data", "/docs/plugins/callback-data/", "typed callback_data pack / unpack"],
		["@yaebal/payments", "/docs/plugins/payments/", "typed invoice builder (stars / external providers), pre-checkout & successful-payment hooks, star subscriptions"],
		["@yaebal/mini-app", "/docs/plugins/mini-app/", "telegram Mini Apps server protocol — HMAC + Ed25519 (third-party) initData validation, typed parser & test signer, Authorization: tma header helper, answerWebAppQuery, WebAppInfo/deep-link url generator"],
		["@yaebal/link-preview", "/docs/plugins/link-preview/", "fluent builder for link_preview_options"],
		["@yaebal/inline-results", "/docs/plugins/inline-results/", "typed builders for every InlineQueryResult / InputMessageContent variant"],
		["@yaebal/auto-answer", "/docs/plugins/auto-answer/", "auto-clears the callback-query loading spinner, no manual answerCallbackQuery call"],
		["@yaebal/typing", "/docs/plugins/typing/", "ctx.typing(fn) keeps the \"is typing…\" indicator alive for an async call, no manual sendChatAction"],
		["@yaebal/ai", "/docs/plugins/ai/", "ctx.ai.replyStream() — llm answers streamed via telegram drafts / throttled edits, model adapters (openai-compatible, anthropic, ai sdk, custom), conversation memory, per-user limits"],
		["@yaebal/filters", "/docs/plugins/filters/", "composable, type-narrowing update filters: and / or / not, commands, deep links, media, async"],
		["@yaebal/guards", "/docs/plugins/guards/", "reusable bot.guard() predicates: isAdmin, isPrivate, isGroup, hasMembership, hasPermission"],
		["@yaebal/fmt", "/docs/plugins/fmt/", "`` html`` `` / `` md`` `` tagged templates with auto-escaping"],
		["@yaebal/rich", "/docs/plugins/rich/", "sendRichMessage / sendRichMessageDraft: block builder + streaming drafts"],
		["@yaebal/morda", "/docs/plugins/morda/", "dialogs engine + jsx/hooks (react-for-telegram)"],
		["@yaebal/i18n", "/docs/plugins/i18n/", "typed ctx.t (keys + params), Intl plurals, language_code detection"],
		["@yaebal/scenes", "/docs/plugins/scenes/", "durable wizards: typed state, ask() validation, navigation, sub-scenes, ttl"],
		["@yaebal/state-machine", "/docs/plugins/state-machine/", "declarative finite-state machines: typed events, guarded transitions, onEnter/onLeave hooks"],
		["@yaebal/onboarding", "/docs/plugins/onboarding/", "declarative first-run tutorials with inline controls"],
		["@yaebal/conversation", "/docs/plugins/conversation/", "await-style multi-step dialogs — coroutine by default, durable replay engine opt-in"],
		["@yaebal/prompt", "/docs/plugins/prompt/", "ask a question, handle the next message"],
		["@yaebal/router", "/docs/plugins/router/", "typed file-based routing — define*() routes, nested guards, watchRoutes hot-reload"],
		["@yaebal/toml", "/docs/plugins/toml/", "declarative toml routes with a handler registry"],
		["@yaebal/throttle", "/docs/plugins/throttle/", "priority outbound scheduler with Telegram buckets"],
		["@yaebal/files", "/docs/plugins/files/", "inspect, link, stream and download telegram files"],
		["@yaebal/file-id", "/docs/plugins/file-id/", "parse and re-serialize file_id / file_unique_id strings"],
		["@yaebal/ratelimiter", "/docs/plugins/ratelimiter/", "drop updates from users who spam"],
		["@yaebal/broadcast", "/docs/plugins/broadcast/", "typed broadcast jobs with storage, retry, progress and controls"],
		["@yaebal/cron", "/docs/plugins/cron/", "typed cron jobs: timezones, retries, catch-up, distributed locks, and a chat-native admin surface"],
		["@yaebal/panel", "/docs/plugins/panel/", "framework-agnostic operator panel with media, keyboards and events"],
		["@yaebal/analytics", "/docs/plugins/analytics/", "ctx.track(event, properties) with pluggable sinks: posthog, plausible, sqlite, clickhouse"],
		["@yaebal/audit-log", "/docs/plugins/audit-log/", "correlated, redacted-by-default audit logging — sinks, formatters, filters, sampling, chatSink, auditAdmin"],
		["@yaebal/web", "/docs/plugins/web/", "webhooks on any runtime — edge, node servers, serverless, fetch frameworks; adapters, sequentialize, dedupe, lifecycle"],
		["@yaebal/runner", "/docs/runner/", "concurrent long-polling for scale"],
		["@yaebal/media-group", "/docs/plugins/media-group/", "collect albums into one handler call or ctx.mediaGroup"],
		["@yaebal/media-cache", "/docs/plugins/media-cache/", "upload once, reuse the file_id — self-heals when telegram rejects it"],
		["@yaebal/split", "/docs/plugins/split/", "long text as multiple messages — entities survive the split"],
		["@yaebal/commands", "/docs/plugins/commands/", "one registry for handlers + the / command menu — localized, scoped, diff-synced"],
		["@yaebal/pagination", "/docs/plugins/pagination/", "paginated lists over any source — lazy fetch, item buttons, typed payload"],
		["@yaebal/preview", "/docs/plugins/preview/", "render telegram-style chats to SVG — reply quotes, reactions, link previews, custom themes"],
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
