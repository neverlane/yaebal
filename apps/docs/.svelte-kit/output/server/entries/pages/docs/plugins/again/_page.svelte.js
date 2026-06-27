import { h as head } from "../../../../../chunks/index.js";
import { C as Code } from "../../../../../chunks/Code.js";
function _page($$renderer) {
  const install = `pnpm add @yaebal/again`;
  const usage = `import { Bot } from "@yaebal/core";
import { autoRetry } from "@yaebal/again";

const bot = new Bot(process.env.BOT_TOKEN!);

// attach the retry handler to the bot's API layer
autoRetry(bot.api);

// all API calls made through bot.api will now be retried automatically
bot.on("message:text", (ctx) => ctx.reply("hello!"));

bot.start();`;
  const customOptions = `autoRetry(bot.api, {
  maxRetries: 5,      // retry up to 5 times (default: 3)
  maxDelayMs: 10_000, // cap each wait at 10 s (default: 30 000)
  retryOnInternal: false, // skip 5xx, only handle 429 (default: true)
});`;
  const decideRetryUsage = `import { decideRetry, type AutoRetryOptions } from "@yaebal/again";
import { TelegramError } from "@yaebal/core";

const opts: AutoRetryOptions = { maxRetries: 3, maxDelayMs: 30_000 };
const action = decideRetry(new TelegramError("sendMessage", 429, "retry after 7"), 1, opts);
// => { retry: true, delayMs: 7000 }`;
  head("1d2ypro", $$renderer, ($$renderer2) => {
    $$renderer2.title(($$renderer3) => {
      $$renderer3.push(`<title>@yaebal/again — yaebal</title>`);
    });
  });
  $$renderer.push(`<h1>@yaebal/again</h1> <p class="lead">auto-retry on 429 / flood-wait and transient 5xx errors.</p> <h2>install</h2> `);
  Code($$renderer, { code: install, title: "terminal", lang: "sh" });
  $$renderer.push(`<!----> <h2>usage</h2> <p>call <code>autoRetry(bot.api)</code> once after constructing the bot. it installs an error hook
	on the API layer — every failed call is inspected and, if retryable, waited on and re-issued
	automatically. no middleware registration needed.</p> `);
  Code($$renderer, { code: usage, title: "bot.ts" });
  $$renderer.push(`<!----> <h2>options</h2> `);
  Code($$renderer, { code: customOptions, title: "bot.ts" });
  $$renderer.push(`<!----> <h2>api</h2> <table><thead><tr><th>export</th><th>signature</th><th>description</th></tr></thead><tbody><tr><td><code>autoRetry</code></td><td><code>(api: Api, options?: AutoRetryOptions) => void</code></td><td>installs the retry hook on <code>bot.api</code></td></tr><tr><td><code>decideRetry</code></td><td><code>(error: unknown, attempt: number, options?: AutoRetryOptions) => ErrorAction | undefined</code></td><td>pure retry-policy function — exported for unit testing</td></tr><tr><td><code>AutoRetryOptions</code></td><td>interface</td><td>options bag passed to both functions</td></tr></tbody></table> <h3>AutoRetryOptions</h3> <table><thead><tr><th>field</th><th>type</th><th>default</th><th>description</th></tr></thead><tbody><tr><td><code>maxRetries</code></td><td><code>number</code></td><td><code>3</code></td><td>max retries after the first attempt</td></tr><tr><td><code>maxDelayMs</code></td><td><code>number</code></td><td><code>30000</code></td><td>cap on a single wait in milliseconds</td></tr><tr><td><code>retryOnInternal</code></td><td><code>boolean</code></td><td><code>true</code></td><td>also retry transient 5xx server errors</td></tr></tbody></table> <h2>retry logic</h2> <p><code>decideRetry</code> inspects errors in this order:</p> <ul><li>attempt exceeds <code>maxRetries</code> → no retry</li> <li>not a <code>TelegramError</code> → no retry</li> <li>code 429 → reads <code>retry after N</code> from the message; falls back to exponential
		backoff (<code>2^attempt</code> seconds); capped at <code>maxDelayMs</code></li> <li>code ≥ 500 and <code>retryOnInternal</code> is true → exponential backoff; capped at <code>maxDelayMs</code></li> <li>anything else (4xx client errors, unknown errors) → no retry</li></ul> `);
  Code($$renderer, { code: decideRetryUsage, title: "policy.ts" });
  $$renderer.push(`<!----> <div class="note"><strong>4xx errors are never retried.</strong> a 400 Bad Request means the call itself is wrong
	— retrying it would loop forever. only 429 and 5xx are candidates. <br/><br/> <strong><code>decideRetry</code> is a pure function with no I/O</strong> — it is exported
	specifically so you can unit-test a custom policy without mocking network calls.</div>`);
}
export {
  _page as default
};
