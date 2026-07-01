<script lang="ts">
	import Code from "$lib/Code.svelte";

	const importExample = `import type {
  Message,
  User,
  Chat,
  PhotoSize,
  SendMessageParams,
  SendPhotoParams,
  BotApiMethods,
  BOT_API_VERSION,
} from "@yaebal/types";`;

	const versionConst = `import { BOT_API_VERSION } from "@yaebal/types";
console.log(BOT_API_VERSION); // e.g. "10.1"`;

	const methodsInterface = `import type { BotApiMethods, SendMessageParams } from "@yaebal/types";

// BotApiMethods is an interface with every Bot API method fully typed
type SendMessage = BotApiMethods["sendMessage"];
// (params: SendMessageParams) => Promise<Message>

// *params interfaces carry every field the method accepts
const params: SendMessageParams = {
  chat_id: 123456,
  text: "hello",
  parse_mode: "HTML", // optional fields are typed too
};`;

	const regen = `# scrapes core.telegram.org/bots/api, refreshes schema.json, regenerates src/telegram.ts,
# and bumps the package version to the Bot API version — no-op if already up to date
pnpm --filter @yaebal/types update-schema`;

	const fileHead = `// AUTO-GENERATED from the Telegram Bot API schema — do not edit by hand.
// regenerate with: pnpm --filter @yaebal/types generate
// source: https://core.telegram.org/bots/api (scraped by scripts/lib/parse-schema.mjs)

export const BOT_API_VERSION = "10.1";

export interface AffiliateInfo { /* … */ }
export interface Animation { /* … */ }
// … all Bot API objects …
export interface SendMessageParams { /* … */ }
// … all *Params interfaces …
export interface BotApiMethods {
  sendMessage(params: SendMessageParams): Promise<Message>;
  // … every method …
}`;
</script>

<svelte:head>
	<title>@yaebal/types — yaebal</title>
</svelte:head>

<h1>@yaebal/types</h1>
<p class="lead">
	full Telegram Bot API types, code-generated from a schema scraped directly off
	<a href="https://core.telegram.org/bots/api">core.telegram.org/bots/api</a> by our own parser —
	no dependency on a third-party schema project. the single source of truth for every interface in
	the yaebal ecosystem — <code>@yaebal/contexts</code> and <code>@yaebal/core</code> both read from
	it.
</p>

<h2>what it exports</h2>
<table>
	<thead>
		<tr><th>export</th><th>kind</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td>object interfaces</td>
			<td><code>interface</code></td>
			<td>
				one TypeScript interface per Bot API object — <code>Message</code>, <code>User</code>,
				<code>Chat</code>, <code>PhotoSize</code>, <code>InlineKeyboardMarkup</code>, etc.
			</td>
		</tr>
		<tr>
			<td><code>*Params</code> interfaces</td>
			<td><code>interface</code></td>
			<td>
				one interface per Bot API method's parameters — <code>SendMessageParams</code>,
				<code>SendPhotoParams</code>, <code>AnswerCallbackQueryParams</code>, etc. required fields
				are non-optional; optional fields carry <code>?</code>.
			</td>
		</tr>
		<tr>
			<td><code>BotApiMethods</code></td>
			<td><code>interface</code></td>
			<td>
				every Bot API method as a typed function signature:
				<code>sendMessage(params: SendMessageParams): Promise&lt;Message&gt;</code> and so on.
			</td>
		</tr>
		<tr>
			<td><code>BOT_API_VERSION</code></td>
			<td><code>string</code></td>
			<td>the Bot API version the current file was generated from, e.g. <code>"10.1"</code>.</td>
		</tr>
	</tbody>
</table>

<h2>importing types</h2>
<Code code={importExample} title="types.ts" />

<h2>BOT_API_VERSION</h2>
<Code code={versionConst} title="version.ts" />

<h2>BotApiMethods and *Params interfaces</h2>
<Code code={methodsInterface} title="methods.ts" />

<h2>file structure</h2>
<p>
	<code>src/telegram.ts</code> is the sole generated file. it is committed to the repository as the
	authoritative snapshot. do not edit it by hand — any manual edit will be overwritten on the next
	generation run.
</p>
<Code code={fileHead} title="src/telegram.ts (excerpt)" />

<h2>regenerating</h2>
<p>
	<code>scripts/lib/parse-schema.mjs</code> is our own parser for
	<a href="https://core.telegram.org/bots/api">core.telegram.org/bots/api</a> — it scrapes the
	live docs HTML straight into the same <code>schema.json</code> shape
	<code>scripts/generate.mjs</code> already consumes, so there is no third-party schema in the
	loop. <code>scripts/update-schema.mjs</code> ties the two together: it fetches the live docs,
	compares the parsed version against the committed <code>schema.json</code>, and — only if
	newer — refreshes <code>schema.json</code>, regenerates <code>src/telegram.ts</code> (and
	<code>@yaebal/contexts</code>), and bumps <code>@yaebal/types</code>'s own version to match the
	Bot API version:
</p>
<Code code={regen} lang="sh" title="terminal" />
<p>
	a scheduled workflow (<code>.github/workflows/update-bot-api-types.yml</code>) runs this once a
	day; if there's a newer Bot API version it opens a PR (<code>feat(types): update to bot api
	vX.Y.Z</code>) after typecheck/build/test/lint all pass. merging it publishes
	<code>@yaebal/types@X.Y.Z</code> through the normal release pipeline — no manual step required.
</p>

<h2>relationship to other packages</h2>
<table>
	<thead>
		<tr><th>package</th><th>how it uses @yaebal/types</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><a href="/docs/core/">@yaebal/core</a></td>
			<td>imports object interfaces for context fields (<code>Message</code>, <code>User</code>, <code>Chat</code>, …)</td>
		</tr>
		<tr>
			<td><a href="/docs/contexts/">@yaebal/contexts</a></td>
			<td>code-generates per-update shortcut methods from <code>BotApiMethods</code> and the <code>*Params</code> interfaces</td>
		</tr>
	</tbody>
</table>

<div class="note">
	<code>@yaebal/types</code> has zero runtime dependencies — it is types-only. import with
	<code>import type</code> in application code so the import is erased at build time and never
	appears in the output bundle.
</div>
