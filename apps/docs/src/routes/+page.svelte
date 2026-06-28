<script lang="ts">
	import Code from "$lib/Code.svelte";
	import ThemeToggle from "$lib/ThemeToggle.svelte";
	import { GITHUB } from "$lib/nav";

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
			title: "type-safe",
			body: "strict mode, no any in public types. the context type flows through the whole chain.",
		},
		{
			title: "chainable",
			body: "Bot extends Composer. derive / decorate / guard each return an augmented context type.",
		},
		{
			title: "auto-gen contexts",
			body: "every per-update context and its shortcut methods are generated from the Bot API schema.",
		},
		{
			title: "plugin-first",
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
		<a class="link" href={GITHUB} target="_blank" rel="noreferrer">github</a>
		<ThemeToggle />
	</nav>
</header>

<main class="hero">
	<div class="glow"></div>

	<span class="eyebrow mono">type-safe · chainable · plugin-first</span>
	<h1 class="wordmark unbounded">yaebal</h1>
	<p class="tagline">
		yet another telegram bot api library.<br />
		the context type <em>accumulates</em> through the chain — handlers see what plugins added,
		with zero casting.
	</p>

	<div class="cta">
		<a class="button accent" href="/docs/getting-started/">get started →</a>
		<a class="button" href={GITHUB} target="_blank" rel="noreferrer">github</a>
	</div>

	<div class="install mono">
		<span class="prompt">$</span> pnpm add @yaebal/core
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

	.install {
		margin-top: 22px;
		padding: 11px 18px;
		font-size: 13.5px;
		border-radius: 12px;
		border: 1px solid var(--code-stroke);
		background: var(--code-bg);
		color: var(--secondary);
	}

	.install .prompt {
		color: var(--gray);
		margin-right: 8px;
		user-select: none;
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
