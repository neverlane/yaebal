import type {
	Animation,
	Audio,
	Contact,
	Document,
	Location,
	MessageEntity,
	PhotoSize,
	Poll,
	PollOption,
	Sticker,
	Venue,
	Video,
	Voice,
} from "@yaebal/types";
import type { Palette, Theme } from "./theme.js";

export type Side = "user" | "bot" | "system";
export type TickStatus = "sent" | "delivered" | "read";

/**
 * media fields accept the real `@yaebal/types` shape (hand it `ctx.message.voice` verbatim) —
 * `Partial<T>` also accepts the minimal hand-written fixture (`{ duration: 7 }`) that the docs
 * examples use, since every full object trivially satisfies its own partial.
 */
export type Loose<T> = Partial<T>;
export type LoosePoll = Partial<Omit<Poll, "options">> & { options: Partial<PollOption>[] };

export interface ReplyQuote {
	/** quoted sender's name. */
	name?: string;
	/** quoted text snippet. */
	text?: string;
	/** telegram entities for the quoted `text`. */
	entities?: MessageEntity[];
	/** accent bar + name colour; defaults to a colour derived from `name`. */
	accent?: string;
	/** small kind label shown when the quoted message was media, not text. */
	media?:
		| "photo"
		| "video"
		| "voice"
		| "audio"
		| "document"
		| "sticker"
		| "poll"
		| "location"
		| "contact";
}

export interface ForwardHeader {
	/** original sender's name. */
	from: string;
}

export interface Reaction {
	/** the reaction emoji. */
	emoji: string;
	/** reaction count shown next to the emoji. */
	count: number;
	/** highlight as the viewer's own reaction. */
	chosen?: boolean;
}

export interface WebpagePreview {
	/** site name shown in the accent colour (e.g. "github.com"). */
	site?: string;
	/** bold link title. */
	title?: string;
	/** secondary description text (wrapped, truncated to a few lines). */
	description?: string;
	/** real thumbnail URL/data-URI — a bare `file_id`-less preview has none. */
	src?: string;
}

export interface ChatMessage {
	from: Side;
	/** sender label (incoming); also drives the avatar initial + colour. */
	name?: string;
	time?: string;
	/** outgoing read receipt (ticks). ignored for incoming. */
	status?: TickStatus;
	/** keyboard rows rendered as buttons under the message. */
	buttons?: string[][];
	/** rendered as compact diagnostic text above the bubble. */
	debug?: string | string[];
	/** rendered in the time/meta slot when `time` is not provided. */
	messageId?: string | number;
	/** override the avatar glyph for just this message (else `RenderOptions.avatar`/name initial). */
	avatar?: string;
	/** shows "edited" next to the time. */
	edited?: boolean;
	/** shows a pin glyph next to the time. */
	pinned?: boolean;

	/** reply-to quote, rendered above the message content. */
	reply?: ReplyQuote;
	/** "Forwarded from …" header, rendered above the message content. */
	forward?: ForwardHeader;
	/** reaction pills rendered under the bubble. */
	reactions?: Reaction[];
	/** link-preview card, rendered above the text (like telegram's own webpage preview). */
	webpage?: WebpagePreview;

	/** message text. spread `@yaebal/fmt`'s `md`/`html` to also pass `entities`. */
	text?: string;
	/** telegram entities for `text` (bold/italic/code/link/spoiler/…). */
	entities?: MessageEntity[];
	/** caption for a media message. */
	caption?: string;
	/** telegram entities for `caption`. */
	captionEntities?: MessageEntity[];

	/** real image/thumb URL or data-URI for the picture-like media below (a `file_id` can't render). */
	src?: string;
	/** cover the media with a spoiler. */
	spoiler?: boolean;

	// media — accepts the real @yaebal/types shape (the array/objects you'd get off an Update)
	// or a hand-written partial fixture with just the fields the renderer actually draws.
	photo?: Loose<PhotoSize>[];
	sticker?: Loose<Sticker>;
	animation?: Loose<Animation>;
	video?: Loose<Video>;
	voice?: Loose<Voice>;
	audio?: Loose<Audio>;
	document?: Loose<Document>;
	venue?: Loose<Venue>;
	location?: Loose<Location>;
	contact?: Loose<Contact>;
	poll?: LoosePoll;
}

export interface RenderOptions {
	/** `"light"` / `"dark"` pick a built-in look; pass a `Palette` (full or partial) for a custom theme. default `"light"`. */
	theme?: Theme;
	/** point overrides layered on top of `theme` — e.g. `{ theme: "dark", palette: { out: "#204020" } }`. */
	palette?: Partial<Palette>;
	/** canvas width in px. defaults to `380`. */
	width?: number;
	/** scale the whole canvas (viewBox stays 1x, only `width`/`height` attrs scale) — for crisp @2x/@3x rasterization. */
	scale?: number;
	/** override the avatar glyph for incoming messages (else the name's initial). overridable per-message via `ChatMessage.avatar`. */
	avatar?: string;
	/** solid override for the wallpaper background (else the theme's two-tone gradient). */
	wallpaper?: string;
	/** fixed id prefix instead of a random one — for deterministic output (tests, snapshots). */
	idPrefix?: string;
	/** `<title>` for the root `<svg>` (accessibility + SEO). defaults to a generic label. */
	a11yTitle?: string;
	/** `<desc>` for the root `<svg>`. */
	a11yDesc?: string;
}
