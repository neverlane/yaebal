<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/ai`;

	const quickstart = `import { AiLimitError, ai, openaiCompatible } from "@yaebal/ai";
import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!).install(
  ai({
    model: openaiCompatible({ model: "gpt-4o-mini", apiKey: process.env.OPENAI_API_KEY }),
    system: "you are a concise, friendly assistant.",
    limits: { perUser: "20/h" },
  }),
);

bot.command("reset", async (ctx) => {
  await ctx.ai.reset();
  await ctx.send("clean slate. who are you again?");
});

bot.on("message:text", async (ctx) => {
  try {
    // private chats: telegram's native draft animation ("Thinking…", live preview).
    // groups: a message growing through throttled edits with a ▍ cursor.
    await ctx.ai.replyStream(ctx.text);
  } catch (error) {
    if (error instanceof AiLimitError) {
      const minutes = Math.ceil(error.retryAfterMs / 60_000);
      await ctx.reply(\`easy! you hit the hourly limit — try again in ~\${minutes}m.\`);
      return;
    }
    throw error;
  }
});

await bot.start();`;

	const models = `import { ai, aiSdk, anthropicModel, customModel, openaiCompatible } from "@yaebal/ai";

// 1. any /chat/completions provider — openai, ollama, openrouter, groq, mistral, deepseek…
openaiCompatible({ model: "llama3.2", baseUrl: "http://localhost:11434/v1" });

// 2. anthropic, natively
anthropicModel({ model: "claude-sonnet-5", apiKey: process.env.ANTHROPIC_API_KEY! });

// 3. the whole vercel ai sdk ecosystem (needs \`pnpm add ai\` + a provider package)
import { anthropic } from "@ai-sdk/anthropic";
ai({ model: anthropic("claude-sonnet-5") }); // LanguageModel is auto-detected

// 4. anything that yields strings — the escape hatch
customModel(async function* ({ messages }) {
  yield "hello ";
  yield "world";
});`;

	const streaming = `bot.install(
  ai({
    model,
    parseMode: "MarkdownV2",           // applied at finalization only
    streaming: {
      intervalMs: 800,                 // min gap between preview updates
      drafts: true,                    // sendMessageDraft in private chats
      cursor: "▍",                     // in-flight cursor for edit mode, "" disables
    },
  }),
);`;

	const memory = `import { redisStorage } from "@yaebal/sklad";

bot.install(
  ai({
    model,
    memory: {
      storage: redisStorage({ client: redis }), // any sklad StorageAdapter
      window: 32,                               // stored turns, user + assistant combined
      // key: default is per user per chat — each group member gets their own thread
    },
  }),
);

// or stateless: every call sees only its own prompt
bot.install(ai({ model, memory: false }));`;

	const limits = `import { AiLimitError } from "@yaebal/ai";

bot.install(ai({ model, limits: { perUser: "20/h" } })); // also "5/m", "100/d", "1/s"

bot.on("message:text", async (ctx) => {
  try {
    await ctx.ai.replyStream(ctx.text);
  } catch (error) {
    if (error instanceof AiLimitError) {
      await ctx.reply(\`try again in \${Math.ceil(error.retryAfterMs / 1000)}s\`);
      return;
    }
    throw error;
  }
});`;

	const raw = `// full text, nothing sent — for pipelines and custom rendering
const { text, usage } = await ctx.ai.generate("summarize this: " + ctx.text);

// raw token stream — render it however you like
for await (const piece of ctx.ai.stream(ctx.text)) {
  process.stdout.write(piece);
}

// inspect / wipe this conversation's memory
const turns = await ctx.ai.history();
await ctx.ai.reset();`;

	const testing = `import { ai, customModel } from "@yaebal/ai";
import { createTestEnv } from "@yaebal/test";

// a deterministic model — no network, no api key
const bot = createBot("test-token").install(
  ai({
    model: customModel(async function* () {
      yield "hello ";
      yield "world";
    }),
  }),
);
bot.on("message:text", (ctx) => ctx.ai.replyStream(ctx.text));

const env = createTestEnv(bot);
await env.createUser().sendMessage("hi");
// assert on the recorded sendMessageDraft / sendMessage calls`;
</script>

<svelte:head>
	<title>@yaebal/ai — yaebal</title>
</svelte:head>

<h1>@yaebal/ai</h1>
<p class="lead">
	llm superpowers for telegram bots. <code>ctx.ai.replyStream()</code> streams a model's answer
	straight into the chat — with telegram's native draft animation ("Thinking…", live-updating
	preview) in private chats and throttled edits with a typing cursor everywhere else. conversation
	memory, per-user limits, and a provider-agnostic model contract are built in.
</p>

<div class="note">
	the same package also ships the yaebal dev tooling for ai coding agents — an mcp server with the
	full bot api schema and an installer for claude code, cursor, codex, opencode and friends. that
	side lives on the <a href="/docs/llms/">ai tooling page</a>; this page documents the runtime
	plugin.
</div>

<h2>install</h2>
<Code code={install} lang="sh" title="terminal" />

<h2>quick start</h2>
<p>
	install <code>ai()</code> once — it adds <code>ctx.ai</code> via <code>derive</code>, no other
	plugin required. this is the full streamed chat bot from
	<code>examples/ai-chat</code>: per-user memory on by default, polite rate limits, streamed
	answers.
</p>
<Code code={quickstart} title="bot.ts" />
<div class="note">
	the ai plugin talks to a real llm provider over the network, so there is no runnable playground
	example on this page — copy the snippet and point it at any provider (a local ollama works with
	no api key).
</div>

<h2>models</h2>
<p>any provider works through one of four doors:</p>
<Code code={models} title="models.ts" />
<p>
	<code>openaiCompatible</code> and <code>anthropicModel</code> are zero-dependency
	<code>fetch</code> adapters. the ai sdk bridge lazy-loads the <code>ai</code> package only when
	used, so bots on the built-in adapters never pay for it. a provider http failure throws
	<code>AiProviderError</code> with the status and response body.
</p>

<h2>what lands on ctx</h2>
<p>
	<code>ai()</code> is a <code>Plugin&lt;Context, AiControl&gt;</code> — after
	<code>.install(ai(...))</code> every handler sees <code>ctx.ai</code>:
</p>
<table>
	<thead>
		<tr><th>member</th><th>returns</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>ctx.ai.replyStream(prompt, options?)</code></td>
			<td><code>Promise&lt;AiStreamResult&gt;</code></td>
			<td>stream the answer into the chat — drafts in private chats, throttled edits elsewhere; long answers split across messages</td>
		</tr>
		<tr>
			<td><code>ctx.ai.reply(prompt, options?)</code></td>
			<td><code>Promise&lt;AiReplyResult&gt;</code></td>
			<td>generate fully, then send — a typing indicator stays alive meanwhile</td>
		</tr>
		<tr>
			<td><code>ctx.ai.generate(prompt, options?)</code></td>
			<td><code>Promise&lt;AiReply&gt;</code></td>
			<td>run the model, return <code>{'{ text, usage }'}</code> — sends nothing</td>
		</tr>
		<tr>
			<td><code>ctx.ai.stream(prompt, options?)</code></td>
			<td><code>AsyncIterable&lt;string&gt;</code></td>
			<td>raw token stream for custom rendering — memory is read but not written</td>
		</tr>
		<tr>
			<td><code>ctx.ai.history()</code></td>
			<td><code>Promise&lt;AiMessage[]&gt;</code></td>
			<td>the stored conversation for this update's memory key</td>
		</tr>
		<tr>
			<td><code>ctx.ai.reset()</code></td>
			<td><code>Promise&lt;void&gt;</code></td>
			<td>forget the stored conversation</td>
		</tr>
		<tr>
			<td><code>ctx.ai.model</code></td>
			<td><code>AiModel</code></td>
			<td>the resolved adapter — its <code>id</code> is handy for logs, and it can be called directly</td>
		</tr>
	</tbody>
</table>
<p>
	<code>prompt</code> is a plain string or an <code>AiMessage[]</code>. every call accepts
	per-call overrides (<code>system</code>, <code>memory</code>, <code>temperature</code>,
	<code>maxTokens</code>, <code>signal</code>), and the reply variants take
	<code>onPart</code> to observe every telegram message as it lands.
</p>
<Code code={raw} title="ctx-ai.ts" />

<h2>options</h2>
<table>
	<thead>
		<tr><th>option</th><th>default</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>model</code></td><td>—</td><td><code>AiModel</code> adapter or vercel ai sdk <code>LanguageModel</code> (auto-detected)</td></tr>
		<tr><td><code>system</code></td><td>—</td><td>system prompt — static string or <code>(ctx) =&gt; string</code>, derived per update</td></tr>
		<tr><td><code>memory</code></td><td><code>true</code></td><td><code>false</code>, or <code>{'{ storage, key, window }'}</code></td></tr>
		<tr><td><code>limits.perUser</code></td><td>off</td><td><code>"20/h"</code>-style budget per user; <code>limits.key</code> repartitions it</td></tr>
		<tr><td><code>parseMode</code></td><td>plain</td><td><code>"MarkdownV2"</code> / <code>"HTML"</code> for finalized messages only</td></tr>
		<tr><td><code>streaming.intervalMs</code></td><td><code>500</code> draft / <code>1200</code> edit</td><td>minimum gap between preview updates, ms</td></tr>
		<tr><td><code>streaming.drafts</code></td><td><code>true</code></td><td>opt out of <code>sendMessageDraft</code> in private chats</td></tr>
		<tr><td><code>streaming.cursor</code></td><td><code>"▍"</code></td><td>in-flight cursor for edit mode, <code>""</code> disables</td></tr>
		<tr><td><code>streaming.maxLength</code></td><td><code>4096</code></td><td>per-message length budget before splitting</td></tr>
		<tr><td><code>typing</code></td><td><code>true</code></td><td>typing action during non-streamed replies; <code>{'{ intervalMs }'}</code> tunes the keep-alive</td></tr>
		<tr><td><code>temperature</code>, <code>maxTokens</code></td><td>provider defaults</td><td>forwarded to the model</td></tr>
	</tbody>
</table>

<h2>streaming behavior</h2>
<p>
	<code>replyStream()</code> picks the best rendering mechanism telegram offers for the chat:
</p>
<ul>
	<li>
		<strong>private chats</strong> — the answer renders through <code>sendMessageDraft</code>:
		users see telegram's own native "Thinking…" placeholder before the first token, then an
		animated draft, finalized into a real message via <code>sendMessage</code>.
	</li>
	<li>
		<strong>groups and channels</strong> — drafts don't exist there, so the answer grows by
		throttled <code>editMessageText</code> calls with a <code>▍</code> cursor appended while in
		flight. a typing action covers the silence before the first token.
	</li>
	<li>
		<strong>long answers</strong> — output past 4096 characters is split at word boundaries (via
		<a href="/docs/plugins/split/"><code>@yaebal/split</code></a>) and finalized
		message-by-message while the stream keeps going.
	</li>
	<li>
		<strong>formatting</strong> — <code>parseMode</code> applies to finalized messages only;
		in-flight previews stay plain, so a half-open <code>**bold</code> can never 400 the stream.
		if telegram rejects the finished entities, the text is resent plain instead of being lost.
	</li>
	<li>
		<strong>resilience</strong> — preview ticks are cosmetic: a flood limit or race on a tick is
		swallowed and the next tick catches up; only finalization errors propagate.
	</li>
</ul>
<Code code={streaming} title="streaming.ts" />
<p>
	the result reports how it went: <code>{'{ text, messages, mode, ticks, aborted }'}</code> —
	<code>mode</code> is <code>"draft"</code> or <code>"edit"</code>, and <code>aborted</code> is
	true when the call's <code>signal</code> fired mid-stream. the engine itself is exported as
	<code>streamToChat(target, source, options)</code> for use outside <code>ctx.ai</code>.
</p>

<h2>memory</h2>
<p>
	conversation memory is on by default: keyed per user per chat (each group member gets their own
	thread with the bot), windowed to the last 32 turns, stored in-process. pass any
	<a href="/docs/plugins/sklad/"><code>@yaebal/sklad</code></a> <code>StorageAdapter</code> to
	persist it across restarts, or <code>memory: false</code> for stateless calls.
</p>
<Code code={memory} title="memory.ts" />
<p>
	per call, <code>generate()</code> defaults to no memory while <code>reply()</code>,
	<code>replyStream()</code> and <code>stream()</code> read it; pass
	<code>{'{ memory: true | false }'}</code> in the call options to override either way.
</p>

<h2>limits</h2>
<p>
	<code>limits: {'{ perUser: "20/h" }'}</code> gates every model call with an in-process sliding
	window. an exhausted call throws <code>AiLimitError</code> before the provider is hit —
	<code>retryAfterMs</code> says when the window frees up, so you can answer politely instead of
	burning tokens.
</p>
<Code code={limits} title="limits.ts" />
<div class="note">
	the limiter is per-process — behind multiple instances each process counts separately. for
	cross-instance budgets, put a shared limiter in front of the model call yourself. updates with
	no sender are not limited by default; <code>limits.key</code> changes the partitioning.
</div>

<h2>testing</h2>
<p>
	<code>customModel()</code> makes tests deterministic — a generator that yields scripted pieces
	stands in for the provider, so nothing touches the network. drive the bot with
	<a href="/docs/plugins/test/"><code>@yaebal/test</code></a> and assert on the recorded
	<code>sendMessageDraft</code> / <code>sendMessage</code> / <code>editMessageText</code> calls.
	the streaming engine is also injectable: <code>streaming.now</code> replaces the throttle clock.
</p>
<Code code={testing} title="ai.test.ts" />

<h2>related</h2>
<ul>
	<li><a href="/docs/llms/">ai tooling</a> — the mcp server and agent installer shipped by this same package</li>
	<li><code>examples/ai-chat</code> — the runnable bot this page's quick start is based on</li>
	<li><a href="/docs/plugins/split/"><code>@yaebal/split</code></a> — the word-boundary splitter used for &gt;4096 answers</li>
	<li><a href="/docs/plugins/typing/"><code>@yaebal/typing</code></a> — standalone typing keep-alive for non-ai long calls</li>
	<li><a href="/docs/plugins/sklad/"><code>@yaebal/sklad</code></a> — storage adapters for persistent memory</li>
</ul>
