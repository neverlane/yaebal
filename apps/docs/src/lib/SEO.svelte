<script lang="ts">
	import { page } from "$app/stores";

	const SITE = "https://yaebal.pages.dev";
	const DEFAULT_TITLE = "yaebal — type-safe telegram bot api framework for typescript";
	const DEFAULT_DESCRIPTION =
		"yaebal is a type-safe, chainable, plugin-first telegram bot api framework for typescript with generated contexts, first-party plugins, webhooks, testing, and edge runtime support.";
	const DEFAULT_KEYWORDS =
		"telegram bot framework, telegram bot api, typescript telegram bot, telegram bot library, node telegram bot, bun telegram bot, deno telegram bot, cloudflare workers telegram bot, type-safe telegram bot, yaebal";

	interface PageMeta {
		title: string;
		description: string;
		keywords?: string;
	}

	const PAGE_META: Record<string, PageMeta> = {
		"/": {
			title: DEFAULT_TITLE,
			description: DEFAULT_DESCRIPTION,
			keywords: DEFAULT_KEYWORDS,
		},
		"/docs/introduction": {
			title: "yaebal introduction — type-safe telegram bot framework",
			description:
				"learn what yaebal is, why bot extends composer, how context types accumulate, and how the framework combines ideas from gramio, grammy, and puregram.",
		},
		"/playground": {
			title: "telegram bot playground — yaebal",
			description:
				"run yaebal telegram bot examples in a browser playground with mock chat preview, live bot mode, monaco editor, and shareable snippets.",
			keywords: `${DEFAULT_KEYWORDS}, telegram bot playground, telegram bot preview, online telegram bot editor`,
		},
		"/docs/getting-started": {
			title: "getting started with yaebal — build a telegram bot in typescript",
			description:
				"install yaebal, create your first type-safe telegram bot, run long polling, and switch to webhooks for bun, deno, node, and cloudflare workers.",
		},
		"/docs/yaebal": {
			title: "yaebal meta package — batteries-included telegram bot framework",
			description:
				"use the yaebal meta package for generated rich contexts, keyboard builders, callback-data, formatting, sessions, i18n, media, and webhooks behind one import.",
		},
		"/docs/core": {
			title: "yaebal core concepts — composer, context, derive, decorate, filters",
			description:
				"learn the yaebal middleware engine: bot extends composer, context types accumulate through derive/decorate/install, and filter queries narrow handlers.",
		},
		"/docs/scaffolding": {
			title: "create a yaebal bot — scaffolding with pnpm create yaebal",
			description:
				"scaffold a new yaebal telegram bot with pnpm create yaebal, choose plugins, runtimes, templates, and ci-friendly flags.",
			keywords: `${DEFAULT_KEYWORDS}, pnpm create yaebal, telegram bot scaffolding, typescript bot template`,
		},
		"/docs/context": {
			title: "yaebal context and filters — typed telegram bot handlers",
			description:
				"use yaebal context objects, filter queries, custom filters, guards, and type narrowing to write telegram bot handlers without casts.",
		},
		"/docs/contexts": {
			title: "generated yaebal contexts — telegram update shortcuts",
			description:
				"use generated yaebal per-update contexts with typed shortcuts such as ctx.react, ctx.answer, ctx.editText, and message-specific helpers.",
		},
		"/docs/media": {
			title: "yaebal media and files — telegram file uploads and downloads",
			description:
				"send and download telegram files with yaebal media sources, file ids, urls, buffers, paths, and runtime-safe helpers for node, bun, deno, and edge.",
		},
		"/docs/hooks": {
			title: "yaebal hooks and errors — telegram bot api observability",
			description:
				"use yaebal api hooks for request logging, retries, error handling, telemetry, and telegram bot api failure diagnostics.",
		},
		"/docs/webhooks": {
			title: "yaebal webhooks — deploy telegram bots on web and edge runtimes",
			description:
				"deploy yaebal telegram bots with webhooks, secret tokens, fetch handlers, node adapters, cloudflare workers, and edge runtimes.",
			keywords: `${DEFAULT_KEYWORDS}, telegram bot webhook, cloudflare workers telegram bot, edge telegram bot`,
		},
		"/docs/examples": {
			title: "yaebal examples — runnable telegram bot recipes",
			description:
				"browse runnable yaebal examples for broadcasts, keyboards, sessions, rich messages, onboarding, panel workflows, toml routes, and plugin-heavy bots.",
		},
		"/docs/api": {
			title: "telegram bot api reference for yaebal",
			description:
				"generated telegram bot api method and type reference for yaebal with parameters, return types, official docs links, and yaebal-specific usage examples.",
		},
		"/docs/troubleshooting": {
			title: "yaebal troubleshooting — telegram bot errors and fixes",
			description:
				"symptom-driven fixes for yaebal bots: 409 conflicts, webhook vs polling, allowed updates, callback spinners, sessions, media uploads, edge deploys, and api errors.",
			keywords: `${DEFAULT_KEYWORDS}, telegram bot 409 conflict, telegram webhook not working, telegram callback query spinner, bot api troubleshooting`,
		},
		"/docs/faq": {
			title: "yaebal faq — typescript telegram bot framework answers",
			description:
				"frequently asked questions about yaebal: core vs meta package, esm, runtimes, plugins, generated contexts, sessions, scenes, tests, and webhooks.",
		},
		"/docs/production": {
			title: "production telegram bots with yaebal — resilience, rate limits, webhooks",
			description:
				"production guide for yaebal bots: retries, throttling, inbound rate limiting, concurrent runner, per-chat ordering, webhooks, graceful shutdown, observability, and broadcasts.",
			keywords: `${DEFAULT_KEYWORDS}, telegram bot production, telegram bot rate limits, telegram bot webhooks, telegram bot scaling`,
		},
		"/docs/cheat-sheet": {
			title: "yaebal cheat sheet — quick reference for telegram bot development",
			description:
				"one-page yaebal quick reference for commands, filters, keyboards, callback data, sessions, formatting, media, webhooks, runner, tests, and plugins.",
		},
		"/docs/typed-examples": {
			title: "yaebal typed examples — context type flow in typescript",
			description:
				"type-focused yaebal examples showing how derive, decorate, filters, sessions, plugins, and generated contexts flow through the composer chain without casting.",
		},
		"/docs/llms": {
			title: "yaebal for ai assistants and llms",
			description:
				"llm-friendly entry points for yaebal documentation, including llms.txt, canonical snippets, and guidance for ai coding assistants using the framework.",
		},
		"/docs/runner": {
			title: "@yaebal/runner — concurrent telegram bot long polling",
			description:
				"scale yaebal long polling with @yaebal/runner, concurrent update handling, per-chat ordering, graceful shutdown, and production-safe workers.",
		},
		"/docs/workers": {
			title: "@yaebal/workers — offload cpu work from telegram bot handlers",
			description:
				"use @yaebal/workers to move cpu-heavy telegram bot tasks into worker_threads pools while keeping handlers responsive.",
		},
		"/docs/runtimes": {
			title: "yaebal runtime support — node, bun, deno, and edge",
			description:
				"understand yaebal runtime support across node, bun, deno, cloudflare workers, edge webhooks, file uploads, and platform-specific constraints.",
		},
		"/docs/types": {
			title: "@yaebal/types — generated telegram bot api types",
			description:
				"use @yaebal/types for generated telegram bot api objects, method parameters, return types, update unions, and strict typescript integration.",
		},
		"/docs/packages": {
			title: "yaebal packages map — core, plugins, examples, and generated types",
			description:
				"map every yaebal package: core, meta package, generated contexts, bot api types, first-party plugins, test tools, examples, and docs.",
		},
	};

	const PLUGIN_META: Record<string, PageMeta> = {
		"/docs/plugins": {
			title: "yaebal plugin catalog — first-party telegram bot plugins",
			description:
				"browse yaebal first-party plugins for state, keyboards, formatting, filters, webhooks, testing, routing, retries, rate limits, media, and operations.",
		},
		"/docs/plugins/authoring": {
			title: "authoring yaebal plugins — typed context dependencies",
			description:
				"write yaebal plugins with explicit context requirements, type-safe installation, derived state, decorators, middleware, and reusable composers.",
		},
		"/docs/plugins/again": {
			title: "@yaebal/again — retry telegram bot api calls",
			description:
				"retry yaebal telegram bot api calls after flood waits, 429 responses, transient 5xx errors, network failures, and configurable backoff windows.",
		},
		"/docs/plugins/broadcast": {
			title: "@yaebal/broadcast — typed telegram broadcast jobs",
			description:
				"run typed telegram broadcast jobs with @yaebal/broadcast, storage adapters, retry, rate limits, progress, pause, resume, cancel, and delivery events.",
		},
		"/docs/plugins/callback-data": {
			title: "@yaebal/callback-data — typed telegram callback data",
			description:
				"pack, parse, validate, and route typed telegram callback_data payloads in yaebal inline keyboards without manual string parsing.",
		},
		"/docs/plugins/commands": {
			title: "@yaebal/commands — telegram command registry and menu",
			description:
				"define yaebal command handlers and telegram bot command menus from one registry with typed handlers and deployable command metadata.",
		},
		"/docs/plugins/conversation": {
			title: "@yaebal/conversation — await-style telegram bot dialogs",
			description:
				"build multi-step yaebal telegram bot conversations with await-style flows, typed context, cancellation, validation, and no replay engine.",
		},
		"/docs/plugins/files": {
			title: "@yaebal/files — resolve and download telegram files",
			description:
				"resolve telegram file ids, get file paths, download content, and integrate file handling with yaebal media workflows.",
		},
		"/docs/plugins/filters": {
			title: "@yaebal/filters — composable typed telegram update filters",
			description:
				"compose yaebal update filters with and, or, not, ctx.filter, custom predicates, and type-narrowing handlers.",
		},
		"/docs/plugins/fmt": {
			title: "@yaebal/fmt — safe html and markdown formatting",
			description:
				"format telegram messages with @yaebal/fmt tagged templates, safe html, markdown helpers, escaping, entities, and reusable message fragments.",
		},
		"/docs/plugins/i18n": {
			title: "@yaebal/i18n — telegram bot localization plugin",
			description:
				"add locales, translations, ctx.t, language switching, per-chat language state, and typed message keys to yaebal bots.",
		},
		"/docs/plugins/keyboard": {
			title: "@yaebal/keyboard — telegram inline and reply keyboards",
			description:
				"build telegram inline keyboards and reply keyboards in yaebal with fluent builders, typed buttons, dynamic rows, and callback data integration.",
		},
		"/docs/plugins/media-cache": {
			title: "@yaebal/media-cache — reuse telegram file ids",
			description:
				"cache telegram file ids with @yaebal/media-cache to avoid repeated uploads, speed up sends, and reduce api load in yaebal bots.",
		},
		"/docs/plugins/media-group": {
			title: "@yaebal/media-group — collect telegram albums",
			description:
				"collect telegram media group updates into one yaebal handler with album buffering, timeout control, and typed grouped messages.",
		},
		"/docs/plugins/morda": {
			title: "@yaebal/morda — jsx dialogs for telegram bots",
			description:
				"build telegram bot dialogs with @yaebal/morda, jsx views, hooks, stateful screens, actions, and yaebal context integration.",
		},
		"/docs/plugins/onboarding": {
			title: "@yaebal/onboarding — first-run telegram bot tutorials",
			description:
				"create first-run onboarding flows for yaebal bots with inline controls, typed steps, opt-out state, and reusable tutorial screens.",
		},
		"/docs/plugins/pagination": {
			title: "@yaebal/pagination — paginated telegram bot lists",
			description:
				"build paginated telegram bot lists with @yaebal/pagination, inline prev/next controls, page state, and type-safe callbacks.",
		},
		"/docs/plugins/panel": {
			title: "@yaebal/panel — operator panel for telegram bots",
			description:
				"run a framework-agnostic operator panel for yaebal bots with media previews, chats, keyboards, callbacks, avatars, and event timelines.",
		},
		"/docs/plugins/preview": {
			title: "@yaebal/preview — render telegram chat previews",
			description:
				"render telegram-style chat previews as svg with @yaebal/preview for docs, tests, screenshots, examples, and ui review workflows.",
		},
		"/docs/plugins/prompt": {
			title: "@yaebal/prompt — ask and wait for the next message",
			description:
				"ask a telegram user a question and handle the next reply with @yaebal/prompt, timeouts, validation, and typed context.",
		},
		"/docs/plugins/ratelimiter": {
			title: "@yaebal/ratelimiter — inbound telegram update rate limits",
			description:
				"protect yaebal bots from spam with inbound per-user and per-chat rate limits, dropped updates, cooldown windows, and custom keys.",
		},
		"/docs/plugins/rich": {
			title: "@yaebal/rich — telegram rich messages and drafts",
			description:
				"send telegram rich messages and drafts with @yaebal/rich, block builders, inline builders, streaming drafts, and generated api helpers.",
		},
		"/docs/plugins/router": {
			title: "@yaebal/router — file-based routing for telegram bots",
			description:
				"organize yaebal telegram bot handlers with file-based routes, typed modules, route loading, feature folders, and composer integration.",
		},
		"/docs/plugins/scenes": {
			title: "@yaebal/scenes — step-by-step telegram bot wizards",
			description:
				"build multi-step yaebal bot wizards with scenes, typed steps, sessions, validation, navigation, cancellation, and resumable state.",
		},
		"/docs/plugins/session": {
			title: "@yaebal/session — typed per-chat telegram bot state",
			description:
				"store typed yaebal session state per chat, user, or custom key with pluggable storage, initial values, and context-safe access.",
		},
		"/docs/plugins/split": {
			title: "@yaebal/split — split long telegram messages",
			description:
				"split long telegram messages into bot api sized chunks with @yaebal/split while preserving formatting and send order.",
		},
		"/docs/plugins/test": {
			title: "@yaebal/test — test telegram bots without telegram",
			description:
				"test yaebal bots in-process with virtual users, intercepted api calls, assertions, sessions, callbacks, and no live telegram dependency.",
			keywords: `${DEFAULT_KEYWORDS}, telegram bot testing, test telegram bots, @yaebal/test`,
		},
		"/docs/plugins/throttle": {
			title: "@yaebal/throttle — avoid telegram bot api 429 errors",
			description:
				"throttle outgoing yaebal api calls to avoid telegram 429 errors, global limits, per-chat limits, priority queues, and flood control.",
		},
		"/docs/plugins/toml": {
			title: "@yaebal/toml — declarative telegram bot routes",
			description:
				"define yaebal telegram bot routes in toml files with typed handler registries, filters, commands, and declarative routing.",
		},
		"/docs/plugins/web": {
			title: "@yaebal/web — telegram bot webhooks for web runtimes",
			description:
				"run yaebal bots on web and edge runtimes with @yaebal/web, fetch handlers, webhook helpers, secret tokens, and deployment utilities.",
		},
	};

	const TELEGRAM_META: Record<string, { title: string; description: string }> = {
		"/docs/telegram/payments": {
			title: "telegram payments and stars with yaebal",
			description:
				"build telegram payments, stars invoices, pre-checkout handlers, successful payment flows, and paid media bots with yaebal.",
		},
		"/docs/telegram/inline-mode": {
			title: "telegram inline mode with yaebal",
			description:
				"handle inline queries, chosen inline results, cached answers, switch-inline buttons, and inline search bots with yaebal.",
		},
		"/docs/telegram/chat-admin": {
			title: "telegram chat administration bots with yaebal",
			description:
				"build admin bots with yaebal: bans, restrictions, chat members, join requests, forum topics, permissions, and audit logs.",
		},
		"/docs/telegram/service-events": {
			title: "telegram service events with yaebal",
			description:
				"handle telegram service messages and update kinds in yaebal: joins, boosts, reactions, payments, forum topics, pinned messages, and chat migrations.",
		},
		"/docs/telegram/message-extras": {
			title: "telegram message extras with yaebal",
			description:
				"use reply parameters, link previews, entities, reactions, captions, keyboards, protected content, and message effects in yaebal.",
		},
		"/docs/telegram/deep-links": {
			title: "telegram deep links with yaebal",
			description:
				"build start parameters, referral links, group deep links, payload parsing, and safe onboarding flows with yaebal telegram bots.",
		},
		"/docs/telegram/mini-apps": {
			title: "telegram mini apps with yaebal",
			description:
				"wire telegram mini apps to yaebal bots with web app buttons, init data validation, callback flows, and secure backend handoff.",
		},
	};

	const MIGRATION_META: Record<string, { title: string; description: string }> = {
		"/docs/migration/gramio": {
			title: "migrate from gramio to yaebal",
			description:
				"side-by-side migration guide from gramio to yaebal covering bot, composer, derive, plugins, formatting, keyboards, sessions, and webhooks.",
		},
		"/docs/migration/puregram": {
			title: "migrate from puregram to yaebal",
			description:
				"move puregram bots to yaebal with examples for three-layer api calls, update handlers, generated contexts, plugins, sessions, and webhooks.",
		},
		"/docs/migration/grammy": {
			title: "migrate from grammy to yaebal",
			description:
				"translate grammy bots to yaebal: filters, context flavors, sessions, conversations, transformers, middleware, and bot api calls.",
		},
		"/docs/migration/telegraf": {
			title: "migrate from telegraf to yaebal",
			description:
				"step-by-step telegraf to yaebal migration: handlers, ctx.reply, actions, keyboards, sessions, scenes, webhooks, and typed bot api params.",
		},
	};

	Object.assign(PAGE_META, PLUGIN_META, TELEGRAM_META, MIGRATION_META);

	interface Props {
		title?: string;
		description?: string;
	}

	let {
		title = DEFAULT_TITLE,
		description = DEFAULT_DESCRIPTION,
	}: Props = $props();

	function clean(pathname: string) {
		return pathname.replace(/\/$/, "") || "/";
	}

	function humanizeIdentifier(identifier: string) {
		return identifier
			.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
			.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
			.replace(/[-_]/g, " ")
			.toLowerCase();
	}

	function apiRouteMeta(pathname: string): PageMeta | undefined {
		const method = pathname.match(/^\/docs\/api\/methods\/([^/]+)$/)?.[1];
		if (method) {
			const name = decodeURIComponent(method);
			const words = humanizeIdentifier(name);
			return {
				title: `${name} telegram bot api method reference`,
				description: `generated yaebal reference for the ${name} telegram bot api method, including parameters, return type, official docs links, and typescript usage.`,
				keywords: `${DEFAULT_KEYWORDS}, ${name}, ${words}, telegram bot api ${words}, yaebal api method`,
			};
		}

		const type = pathname.match(/^\/docs\/api\/types\/([^/]+)$/)?.[1];
		if (type) {
			const name = decodeURIComponent(type);
			const words = humanizeIdentifier(name);
			return {
				title: `${name} telegram bot api type reference`,
				description: `generated yaebal reference for the ${name} telegram bot api type, including fields, nested types, official docs links, and typescript usage.`,
				keywords: `${DEFAULT_KEYWORDS}, ${name}, ${words}, telegram bot api ${words}, yaebal api type`,
			};
		}

		return undefined;
	}

	function routeMetadata(pathname: string) {
		return PAGE_META[pathname] ?? apiRouteMeta(pathname);
	}

	function escapeJsonLd(json: string) {
		return json.replace(/</g, "\\u003c");
	}

	const routeMeta = $derived(routeMetadata(clean($page.url.pathname)));
	const effectiveTitle = $derived(routeMeta?.title ?? title);
	const fullTitle = $derived(effectiveTitle.includes("yaebal") ? effectiveTitle : `${effectiveTitle} — yaebal`);
	const effectiveDescription = $derived(routeMeta?.description ?? description);
	const effectiveKeywords = $derived(routeMeta?.keywords ?? DEFAULT_KEYWORDS);
	const canonical = $derived(SITE + $page.url.pathname);
	const ogImage = `${SITE}/og.svg`;
	const structuredData = $derived(JSON.stringify({
		"@context": "https://schema.org",
		"@graph": [
			{
				"@type": "WebSite",
				"@id": `${SITE}/#website`,
				name: "yaebal documentation",
				url: SITE,
				description: DEFAULT_DESCRIPTION,
				inLanguage: "en",
			},
			{
				"@type": "SoftwareSourceCode",
				"@id": `${SITE}/#software`,
				name: "yaebal",
				alternateName: "yet another telegram bot api library",
				url: SITE,
				codeRepository: "https://github.com/neverlane/yaebal",
				programmingLanguage: "typescript",
				runtimePlatform: ["node.js", "bun", "deno", "cloudflare workers"],
				applicationCategory: "DeveloperApplication",
				license: "https://opensource.org/license/mit",
				description: DEFAULT_DESCRIPTION,
				keywords: DEFAULT_KEYWORDS,
			},
			{
				"@type": "TechArticle",
				"@id": `${canonical}#article`,
				headline: fullTitle,
				description: effectiveDescription,
				url: canonical,
				about: { "@id": `${SITE}/#software` },
				inLanguage: "en",
			},
		],
	}));
	const structuredDataScript = $derived(
		`<script type="application/ld+json">${escapeJsonLd(structuredData)}<\/script>`,
	);
</script>

<svelte:head>
	<title>{fullTitle}</title>
	<meta name="description" content={effectiveDescription} />
	<meta name="keywords" content={effectiveKeywords} />
	<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
	<meta name="application-name" content="yaebal" />
	<meta name="apple-mobile-web-app-title" content="yaebal" />
	<link rel="canonical" href={canonical} />
	<link rel="alternate" type="text/plain" href="/llms.txt" title="llm guide for yaebal" />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={fullTitle} />
	<meta property="og:description" content={effectiveDescription} />
	<meta property="og:url" content={canonical} />
	<meta property="og:site_name" content="yaebal" />
	<meta property="og:image" content={ogImage} />
	<meta property="og:image:alt" content="yaebal — type-safe telegram bot api framework" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={fullTitle} />
	<meta name="twitter:description" content={effectiveDescription} />
	<meta name="twitter:image" content={ogImage} />
	{@html structuredDataScript}
</svelte:head>
