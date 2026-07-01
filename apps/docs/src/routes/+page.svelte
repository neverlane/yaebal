<script lang="ts">
	import Code from "$lib/Code.svelte";
	import ThemeToggle from "$lib/ThemeToggle.svelte";

	import { GITHUB, NPMX } from "$lib/nav";

	const sample = `import { Bot } from "@yaebal/core";
import { session } from "@yaebal/session";

const bot = new Bot(process.env.BOT_TOKEN!)
  .install(session()) // ctx.session is now typed
  .derive((ctx) => ({ now: Date.now() }));

bot.on("message:text", (ctx) => {
  //                    ^ context is narrowed to text messages
  ctx.reply("hi " + ctx.from.first_name);
  ctx.react("🔥"); //   ^ auto-generated shortcut
});

bot.start();`;

	const features = [
		{
			title: "🛟 type-safe",
			body: "strict mode, no any in public types. the context type flows through the whole chain.",
		},
		{
			title: "⛓️ chainable",
			body: "Bot extends Composer. derive / decorate / guard each return an augmented context type.",
		},
		{
			title: "🚘 auto-gen contexts",
			body: "every per-update context and its shortcut methods are generated from the Bot API schema.",
		},
		{
			title: "🥇 plugin-first",
			body: "a deep set of first-party plugins — filters, conversation, runner, and more. dependencies are explicit and type-checked, never implicit order.",
		},
	];
</script>

<svelte:head>
	<title>yaebal — yet another telegram bot api library</title>
</svelte:head>

<header class="top">
	<a class="brand unbounded" href="/">yaebal</a>
	<nav class="top-actions">
		<a class="link" href="/docs/getting-started/">docs</a>
		<a class="link" href="/playground/">playground</a>
		<a class="link" href={GITHUB} target="_blank" rel="noopener noreferrer">github</a>
		<a class="link" href={NPMX} target="_blank" rel="noreferrer">npmx</a>
		<ThemeToggle />
	</nav>
</header>

<main class="hero">
	<div class="glow"></div>

	<span class="eyebrow mono">type-safe · chainable · plugin-first</span>
	<h1 class="wordmark unbounded">yaebal</h1>
	<p class="tagline">
		Yet Another tElegram Bot Api Library.<br />
		the context type <em>accumulates</em> through the chain — handlers see what plugins added,
		with zero casting.
	</p>

	<div class="cta">
		<a class="button accent" href="/docs/getting-started/">
			<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M5 12h14" />
				<path d="m13 6 6 6-6 6" />
				<path d="M5 5v14" />
			</svg>
			<span>get started</span>
		</a>
		<a class="button" href={GITHUB} target="_blank" rel="noopener noreferrer" aria-label="Open GitHub repository">
			<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
				<path d="M12 .5a12 12 0 0 0-3.8 23.39c.6.11.82-.26.82-.58v-2.23c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23A11.45 11.45 0 0 1 12 5.8c1.02 0 2.04.14 3 .4 2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.49 5.93.43.37.82 1.1.82 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z" />
			</svg>
			<span>github</span>
		</a>
	</div>

	<div class="install-code">
		<Code code={"pnpm add @yaebal/core"} title="terminal" lang="sh" />
	</div>

	<div class="sample">
		<Code code={sample} title="bot.ts" />
	</div>

	<section class="features">
		{#each features as f}
			<div class="card">
				<h3>{f.title}</h3>
				<p class="subtext">{f.body}</p>
			</div>
		{/each}
	</section>

	<footer class="foot subtext">
		<span>MIT · built on the shoulders of grammY, GramIO & puregram</span>
	</footer>
</main>

<style>
	.top {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px max(24px, env(safe-area-inset-left));
		backdrop-filter: blur(12px);
		border-bottom: 1px solid var(--content-border);
	}

	.brand {
		font-size: 17px;
		font-weight: 700;
	}

	.top-actions {
		display: flex;
		align-items: center;
		gap: 18px;
	}

	.link {
		font-size: 14px;
		font-weight: 500;
		color: var(--gray);
		transition: color 0.16s ease;
	}
	
	@media (hover: hover) {
		.link:hover {
			color: var(--secondary);
		}
	}

	.hero {
		position: relative;
		max-width: var(--content-width);
		margin: 0 auto;
		padding: 64px 24px 80px;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
	}

	.glow {
		position: absolute;
		top: -60px;
		left: 50%;
		transform: translateX(-50%);
		width: 520px;
		height: 320px;
		max-width: 90vw;
		background: radial-gradient(closest-side, var(--blue), transparent);
		opacity: 0.16;
		filter: blur(40px);
		pointer-events: none;
		z-index: -1;
	}

	.eyebrow {
		font-size: 12px;
		color: var(--gray);
		letter-spacing: 0.3px;
		margin-bottom: 22px;
	}

	.wordmark {
		font-size: clamp(64px, 14vw, 128px);
		font-weight: 700;
		line-height: 0.95;
		letter-spacing: -3px;
		margin: 0;
	}

	.tagline {
		max-width: 540px;
		margin: 22px 0 0;
		font-size: 17px;
		line-height: 1.6;
		color: var(--gray);
	}

	.tagline em {
		font-style: normal;
		color: var(--secondary);
		font-weight: 500;
	}

	.cta {
		display: flex;
		gap: 10px;
		margin-top: 32px;
		flex-wrap: wrap;
		justify-content: center;
	}

	.install-code {
		width: min(100%, 360px);
		margin-top: 22px;
		text-align: left;
	}

	.install-code :global(.code) {
		margin: 0;
	}

	.sample {
		width: 100%;
		margin-top: 40px;
		text-align: left;
	}

	.features {
		width: 100%;
		margin-top: 28px;
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
		text-align: left;
	}

	.card {
		padding: 20px;
		border: 1px solid var(--content-border);
		border-radius: 16px;
		background: var(--sidebar-bg);
	}

	.card h3 {
		margin-bottom: 8px;
	}

	.foot {
		margin-top: 56px;
		text-align: center;
	}

	@media (max-width: 620px) {
		.features {
			grid-template-columns: 1fr;
		}
	}
</style>
