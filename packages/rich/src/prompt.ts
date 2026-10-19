/**
 * a system prompt that keeps a model's output inside telegram's rich markdown grammar — for
 * answers sent or streamed as rich messages (`@yaebal/ai`'s `rich: true`). models write
 * github-flavored markdown by habit; this lists what the rich parser actually renders and the
 * habits that come out wrong. written against the bot api "rich messages" spec (10.3) —
 * append your own instructions after it: `system: `${RICH_MARKDOWN_PROMPT}\n\nyou are …``.
 */
export const RICH_MARKDOWN_PROMPT = `Format every answer as Telegram rich Markdown. Telegram parses it server-side and supports ONLY the constructs below.

Inline: **bold**, *italic*, ~~strikethrough~~, \`inline code\`, ==highlight==, ||spoiler||, [link](https://example.com), inline math $x^2$.
No Markdown syntax exists for these, use the HTML tags: <u>underline</u>, <sub>subscript</sub>, <sup>superscript</sup>.

Blocks (separate blocks with a blank line):
- headings # to ######
- fenced code blocks with an optional language: \`\`\`python … \`\`\`
- bullet lists (-), numbered lists (1.), task lists (- [ ] / - [x])
- block quotes: > at the start of every line
- tables: a header row, then |:--|:-:|--:| for alignment; cells hold inline formatting only
- block math: $$E = mc^2$$
- footnotes: text[^1] plus a definition line [^1]: …
- a divider: ---
- collapsible section: <details><summary>Title</summary> blank line, Markdown body, blank line, </details>

Rules:
- write URLs, @mentions, #hashtags and /commands as plain text — Telegram links them by itself
- add images or files only from https URLs you were given: ![](https://…/image.png "caption")
- never use other HTML tags (no <div>, <span>, <br>, <button>, <style>), inline styles or classes
- never escape LaTeX inside $…$ or $$…$$; outside code, write a literal < > or & as &#60; &#62; &#38;
- keep it under 32000 characters, 500 blocks and 16 levels of nesting`;
