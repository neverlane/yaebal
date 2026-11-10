/**
 * types for `window.TelegramWidget` — the api telegram injects into every html widget
 * (core.telegram.org/bots/widgets, profile 1). handy when you write widget code in typescript:
 *
 * ```ts
 * import type { TelegramWidget } from "@yaebal/widget";
 * declare global { interface Window { TelegramWidget?: TelegramWidget } }
 * ```
 */

/** the chat theme — lowercase `#rrggbb`, every key always present. */
export interface WidgetThemeParams {
	bg_color: string;
	text_color: string;
	hint_color: string;
	link_color: string;
	button_color: string;
	button_text_color: string;
	secondary_bg_color: string;
	accent_text_color: string;
	subtitle_text_color: string;
	destructive_text_color: string;
	section_bg_color: string;
	section_header_text_color: string;
	section_separator_color: string;
	header_bg_color: string;
	bottom_bar_bg_color: string;
}

/** the user looking at the widget — only set where the widget may ask the bot. */
export interface WidgetViewer {
	/** equals `from.id` of the queries this viewer sends. */
	id: number;
	first_name?: string;
	last_name?: string;
	username?: string;
	is_premium?: boolean;
}

/** the band the message time / caption covers (px). `top`, `right`, `left` are always 0. */
export interface WidgetContentSafeAreaInset {
	top: number;
	right: number;
	bottom: number;
	left: number;
	cornerRight: number;
	cornerLeft: number;
}

/** what `request()` resolves with — `result` is the bot's `answerWidgetQuery` `data`. */
export interface WidgetRequestAnswer {
	readonly result: string | null;
}

export type WidgetRequestErrorCode =
	| "NOT_ALLOWED"
	| "BUSY"
	| "RATE_LIMITED"
	| "TIMEOUT"
	| "FAILED"
	| "INVALID_ANSWER"
	| "REJECTED"
	| "BAD_REQUEST";

/** what `request()` and the wallet calls reject with. */
export interface WidgetRequestError extends Error {
	readonly name: "WidgetRequestError";
	readonly code: WidgetRequestErrorCode;
}

export type WidgetEventType =
	| "themeChanged"
	| "activated"
	| "deactivated"
	| "chatDataChanged"
	| "publicDataChanged"
	| "contentSafeAreaChanged";

export interface WidgetHapticFeedback {
	impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): WidgetHapticFeedback;
	notificationOccurred(type: "error" | "success" | "warning"): WidgetHapticFeedback;
	selectionChanged(): WidgetHapticFeedback;
}

/** one message of a TON Connect transaction. */
export interface WidgetTonMessage {
	/** user-friendly address. */
	address: string;
	/** nanotons, as a decimal string. */
	amount: string;
	/** base64 BoC. */
	payload?: string;
	/** base64 BoC. */
	stateInit?: string;
}

/** a TON Connect transaction (`from` must be left out — the wallet fills it in). */
export interface WidgetTonTransaction {
	/** unix seconds. */
	valid_until?: number;
	/** `"-239"` mainnet, `"-3"` testnet. */
	network?: string;
	messages: WidgetTonMessage[];
}

export type WidgetSignDataPayload =
	| { type: "text"; text: string }
	| { type: "binary"; bytes: string }
	| { type: "cell"; schema: string; cell: string };

/** the user's TON wallet — `null` without one, without request rights, or in a preview. */
export interface WidgetWallet {
	/** send a transaction; the bot then gets a `sent_transaction` query with `data` as its data. */
	sendTransaction(transaction: WidgetTonTransaction, data: string): Promise<WidgetRequestAnswer>;
	/** ask the wallet to sign; the bot then gets a `sign_data` query with `data` as its data. */
	signData(payload: WidgetSignDataPayload, data: string): Promise<WidgetRequestAnswer>;
}

/** `window.TelegramWidget`. */
export interface TelegramWidget {
	readonly profile: number;
	readonly colorScheme: "light" | "dark";
	readonly themeParams: Readonly<WidgetThemeParams>;
	readonly isActive: boolean;
	readonly isPreview: boolean;
	readonly isForward: boolean;
	readonly chatType: "private" | "group" | "supergroup" | "channel" | null;
	readonly viewer: Readonly<WidgetViewer> | null;
	readonly publicData: string | null;
	readonly chatData: string | null;
	readonly contentSafeAreaInset: Readonly<WidgetContentSafeAreaInset>;
	readonly wallet: WidgetWallet | null;
	readonly HapticFeedback: WidgetHapticFeedback;

	isProfileAtLeast(profile: number): boolean;
	watchPublicData(): void;
	unwatchPublicData(): void;
	/** send 1–64 bytes to the bot (on a tap, or in the background in a private chat). */
	request(data: string, options?: { wallet?: boolean }): Promise<WidgetRequestAnswer>;
	copyText(text: string): void;
	openLink(url: string): void;
	openTelegramLink(url: string): void;
	setResizeAnchor(edge: "top" | "bottom"): void;
	ready(): void;
	onEvent(type: WidgetEventType, handler: (this: TelegramWidget) => void): void;
	offEvent(type: WidgetEventType, handler: (this: TelegramWidget) => void): void;
}

/** the api `widgetClient()`'s runtime installs as `window.yw` (or your `global`) — for typing widget code. */
export interface WidgetClientApi {
	/** `window.TelegramWidget` — `undefined` outside telegram. */
	readonly w: TelegramWidget | undefined;
	/** running inside a telegram widget. */
	readonly available: boolean;
	/** pack an action's payload into query data (throws on a bad payload or >64 bytes). */
	pack(action: string, data?: Record<string, unknown>): string;
	/** the decoded `public_data` (`undefined` when absent or malformed). */
	publicData(): unknown;
	/** the decoded `chat_data` (`undefined` when absent or malformed). */
	chatData(): unknown;
	/** subscribe to a widget event; returns an unsubscribe function. */
	on(type: WidgetEventType, handler: () => void): () => void;
	/** start live updates of a shared widget's public data. */
	watch(): void;
	unwatch(): void;
	/** call `fn` now and on every state change with the decoded state; returns an unsubscribe. */
	onState(fn: (state: { publicData: unknown; chatData: unknown }) => void): () => void;
	/** send raw query data; resolves with the (json-parsed) answer, `null` for none. */
	request(data: string, options?: { wallet?: boolean }): Promise<unknown>;
	/** pack + send an action; resolves with the (json-parsed) answer. call synchronously in a tap handler. */
	ask(
		action: string,
		data?: Record<string, unknown>,
		options?: { wallet?: boolean },
	): Promise<unknown>;
	/** ask the bot for a TON transaction (sending the wallet card) and pass it to the wallet. needs `wallet: true`. */
	pay?(action: string, data?: Record<string, unknown>): Promise<unknown>;
	/** ask the wallet to sign `payload`; the bot gets a `sign_data` query labelled with the action. needs `wallet: true`. */
	sign?(
		payload: WidgetSignDataPayload,
		action: string,
		data?: Record<string, unknown>,
	): Promise<unknown>;
	/** the `WidgetRequestError` code of a rejection (`"FAILED"` for anything else). */
	code(error: unknown): WidgetRequestErrorCode;
}
