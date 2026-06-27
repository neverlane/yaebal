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
console.log(BOT_API_VERSION); // e.g. "8.3"`;

	const methodsInterface = `import type { BotApiMethods, SendMessageParams } from "@yaebal/types";

// BotApiMethods is an interface with every Bot API method fully typed
type SendMessage = BotApiMethods["sendMessage"];
// (params: SendMessageParams) => Promise<Message>

// *Params interfaces carry every field the method accepts
const params: SendMessageParams = {
  chat_id: 123456,
  text: "hello",
  parse_mode: "HTML", // optional fields are typed too
};`;

	const regen = `# refresh schema.json from ark0f's machine-readable Bot API schema, then:
pnpm --filter @yaebal/types generate`;

	const fileHead = `// AUTO-GENERATED from the Telegram Bot API schema — do not edit by hand.
// Regenerate with: pnpm --filter @yaebal/types generate
// Source: https://ark0f.github.io/tg-bot-api/

export const BOT_API_VERSION = "8.3";

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
	full Telegram Bot API types, code-generated from the
	<a href="https://ark0f.github.io/tg-bot-api/">ark0f machine-readable schema</a>. the single
	source of truth for every interface in the yaebal ecosystem — <code>@yaebal/contexts</code> and
	<code>@yaebal/core</code> both read from it.
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
			<td>the Bot API version the current file was generated from, e.g. <code>"8.3"</code>.</td>
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
	the generator script (<code>scripts/generate.mjs</code>) reads <code>schema.json</code> (the
	ark0f schema snapshot checked into the repo) and rewrites <code>src/telegram.ts</code>. update
	<code>schema.json</code> to the latest version from
	<a href="https://ark0f.github.io/tg-bot-api/">ark0f.github.io/tg-bot-api</a>, then run:
</p>
<Code code={regen} lang="sh" title="terminal" />

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
