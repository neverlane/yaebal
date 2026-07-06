import type {
	ForceReply,
	InlineKeyboardButton,
	InlineKeyboardMarkup,
	KeyboardButton,
	KeyboardButtonRequestChat,
	KeyboardButtonRequestManagedBot,
	KeyboardButtonRequestUsers,
	LoginUrl,
	ReplyKeyboardMarkup,
	ReplyKeyboardRemove,
	SwitchInlineQueryChosenChat,
} from "@yaebal/types";

export type {
	ForceReply,
	InlineKeyboardButton,
	InlineKeyboardMarkup,
	KeyboardButton,
	KeyboardButtonRequestChat,
	KeyboardButtonRequestManagedBot,
	KeyboardButtonRequestUsers,
	LoginUrl,
	ReplyKeyboardMarkup,
	ReplyKeyboardRemove,
	SwitchInlineQueryChosenChat,
} from "@yaebal/types";

// both button types share this union — reuse rather than redeclare it.
type ButtonStyle = NonNullable<KeyboardButton["style"]>;

/** fluent inline keyboard. `.row()` ends a row; buttons accumulate into the current one. */
export class InlineKeyboard {
	#rows: InlineKeyboardButton[][] = [];
	#current: InlineKeyboardButton[] = [];
	#columns?: number;

	#push(button: InlineKeyboardButton): this {
		this.#current.push(button);
		if (this.#columns && this.#current.length >= this.#columns) this.row();
		return this;
	}

	#lastButton(): InlineKeyboardButton {
		const button = this.#current.at(-1) ?? this.#rows.at(-1)?.at(-1);
		if (!button) throw new Error("no button to style yet — add one before .style()/.icon()");
		return button;
	}

	/** appends raw button objects — useful for buttons built from dynamic data (e.g. `.add(...items.map(...))`). */
	add(...buttons: InlineKeyboardButton[]): this {
		for (const button of buttons) this.#push(button);
		return this;
	}

	/** auto-wraps buttons into rows of `columns`; call with no argument to disable. */
	columns(columns?: number): this {
		this.#columns = columns;
		return this;
	}

	text(label: string, data: string): this {
		return this.add(InlineKeyboard.text(label, data));
	}

	static text(label: string, data: string): InlineKeyboardButton {
		return { text: label, callback_data: data };
	}

	url(label: string, url: string): this {
		return this.add(InlineKeyboard.url(label, url));
	}

	static url(label: string, url: string): InlineKeyboardButton {
		return { text: label, url };
	}

	webApp(label: string, url: string): this {
		return this.add(InlineKeyboard.webApp(label, url));
	}

	static webApp(label: string, url: string): InlineKeyboardButton {
		return { text: label, web_app: { url } };
	}

	/** auto-login button. defaults to the current bot's username if `bot_username` isn't set. */
	login(label: string, url: string, options: Omit<LoginUrl, "url"> = {}): this {
		return this.#push({ text: label, login_url: { url, ...options } });
	}

	switchInline(label: string, query = ""): this {
		return this.#push({ text: label, switch_inline_query: query });
	}

	/** inserts the query into the *current* chat's input field, instead of prompting for a chat. */
	switchInlineCurrentChat(label: string, query = ""): this {
		return this.#push({ text: label, switch_inline_query_current_chat: query });
	}

	/** like `switchInline`, but restricts which chat types the user may pick. */
	switchInlineChosenChat(label: string, options: SwitchInlineQueryChosenChat = {}): this {
		return this.#push({ text: label, switch_inline_query_chosen_chat: options });
	}

	/** copies `text` to the user's clipboard when pressed. */
	copyText(label: string, text: string): this {
		return this.#push({ text: label, copy_text: { text } });
	}

	/** Stars/invoice pay button. must be the first button of the first row. */
	pay(label: string): this {
		return this.#push({ text: label, pay: true });
	}

	/** launches the game configured for this bot via @BotFather. must be the first button of the first row. */
	game(label: string): this {
		return this.#push({ text: label, callback_game: {} });
	}

	/** styles the most recently added button ("danger" | "success" | "primary"). */
	style(style: ButtonStyle): this {
		this.#lastButton().style = style;
		return this;
	}

	/** shows a custom emoji before the label of the most recently added button. */
	icon(customEmojiId: string): this {
		this.#lastButton().icon_custom_emoji_id = customEmojiId;
		return this;
	}

	row(): this {
		if (this.#current.length > 0) {
			this.#rows.push(this.#current);
			this.#current = [];
		}

		return this;
	}

	build(): InlineKeyboardMarkup {
		// clone so a returned markup never aliases the live in-progress row.
		const rows = this.#current.length > 0 ? [...this.#rows, [...this.#current]] : [...this.#rows];
		return { inline_keyboard: rows };
	}

	/** lets `JSON.stringify` (and thus `Api`, which stringifies `reply_markup`) accept the builder directly. */
	toJSON(): InlineKeyboardMarkup {
		return this.build();
	}

	/** makes the builder structurally satisfy `InlineKeyboardMarkup`, so typed `reply_markup` params take it directly. */
	get inline_keyboard(): InlineKeyboardButton[][] {
		return this.build().inline_keyboard;
	}
}

/** fluent reply keyboard with resize / one-time / persistence flags. */
export class Keyboard {
	#rows: KeyboardButton[][] = [];
	#current: KeyboardButton[] = [];
	#columns?: number;
	#isPersistent = false;
	#resize = false;
	#oneTime = false;
	#selective = false;
	#placeholder?: string;

	#push(button: KeyboardButton): this {
		this.#current.push(button);
		if (this.#columns && this.#current.length >= this.#columns) this.row();
		return this;
	}

	#lastButton(): KeyboardButton {
		const button = this.#current.at(-1) ?? this.#rows.at(-1)?.at(-1);
		if (!button) throw new Error("no button to style yet — add one before .style()/.icon()");
		return button;
	}

	/** appends raw button objects — useful for buttons built from dynamic data (e.g. `.add(...items.map(...))`). */
	add(...buttons: KeyboardButton[]): this {
		for (const button of buttons) this.#push(button);
		return this;
	}

	/** auto-wraps buttons into rows of `columns`; call with no argument to disable. */
	columns(columns?: number): this {
		this.#columns = columns;
		return this;
	}

	text(label: string): this {
		return this.add(Keyboard.text(label));
	}

	static text(label: string): KeyboardButton {
		return { text: label };
	}

	requestContact(label: string): this {
		return this.#push({ text: label, request_contact: true });
	}

	requestLocation(label: string): this {
		return this.#push({ text: label, request_location: true });
	}

	/** asks the user to compose and send a poll. omit `type` to allow either kind. */
	requestPoll(label: string, type?: "quiz" | "regular"): this {
		return this.#push({ text: label, request_poll: type ? { type } : {} });
	}

	webApp(label: string, url: string): this {
		return this.#push({ text: label, web_app: { url } });
	}

	/**
	 * opens a user picker; the selection comes back as a `users_shared` service message.
	 * `requestId` is echoed back in `UsersShared` so you can tell multiple request buttons apart —
	 * must be unique within the keyboard.
	 */
	requestUsers(
		label: string,
		requestId: number,
		options: Omit<KeyboardButtonRequestUsers, "request_id"> = {},
	): this {
		return this.add(Keyboard.requestUsers(label, requestId, options));
	}

	static requestUsers(
		label: string,
		requestId: number,
		options: Omit<KeyboardButtonRequestUsers, "request_id"> = {},
	): KeyboardButton {
		return { text: label, request_users: { request_id: requestId, ...options } };
	}

	/**
	 * opens a chat picker; the selection comes back as a `chat_shared` service message.
	 * `requestId` is echoed back in `ChatShared` — must be unique within the keyboard.
	 */
	requestChat(
		label: string,
		requestId: number,
		isChannel: boolean,
		options: Omit<KeyboardButtonRequestChat, "request_id" | "chat_is_channel"> = {},
	): this {
		return this.add(Keyboard.requestChat(label, requestId, isChannel, options));
	}

	static requestChat(
		label: string,
		requestId: number,
		isChannel: boolean,
		options: Omit<KeyboardButtonRequestChat, "request_id" | "chat_is_channel"> = {},
	): KeyboardButton {
		return {
			text: label,
			request_chat: { request_id: requestId, chat_is_channel: isChannel, ...options },
		};
	}

	/**
	 * asks the user to create a bot managed by the current bot (requires bot management enabled
	 * in @BotFather). the result arrives as `update.managed_bot` and `message.managed_bot_created`.
	 * `requestId` must be unique within the keyboard.
	 */
	requestManagedBot(
		label: string,
		requestId: number,
		options: Omit<KeyboardButtonRequestManagedBot, "request_id"> = {},
	): this {
		return this.add(Keyboard.requestManagedBot(label, requestId, options));
	}

	static requestManagedBot(
		label: string,
		requestId: number,
		options: Omit<KeyboardButtonRequestManagedBot, "request_id"> = {},
	): KeyboardButton {
		return { text: label, request_managed_bot: { request_id: requestId, ...options } };
	}

	/** styles the most recently added button ("danger" | "success" | "primary"). */
	style(style: ButtonStyle): this {
		this.#lastButton().style = style;
		return this;
	}

	/** shows a custom emoji before the label of the most recently added button. */
	icon(customEmojiId: string): this {
		this.#lastButton().icon_custom_emoji_id = customEmojiId;
		return this;
	}

	row(): this {
		if (this.#current.length > 0) {
			this.#rows.push(this.#current);
			this.#current = [];
		}

		return this;
	}

	/** keeps the keyboard shown even when it would otherwise collapse to the keyboard icon. */
	persistent(value = true): this {
		this.#isPersistent = value;
		return this;
	}

	resized(value = true): this {
		this.#resize = value;
		return this;
	}

	oneTime(value = true): this {
		this.#oneTime = value;
		return this;
	}

	/** placeholder shown in the input field while this keyboard is active (1-64 chars). */
	placeholder(text: string): this {
		this.#placeholder = text;
		return this;
	}

	/** show/hide only for @mentioned users or the sender being replied to. */
	selective(value = true): this {
		this.#selective = value;
		return this;
	}

	build(): ReplyKeyboardMarkup {
		// clone so a returned markup never aliases the live in-progress row.
		const keyboard =
			this.#current.length > 0 ? [...this.#rows, [...this.#current]] : [...this.#rows];

		return {
			keyboard,
			...(this.#isPersistent ? { is_persistent: true } : {}),
			...(this.#resize ? { resize_keyboard: true } : {}),
			...(this.#oneTime ? { one_time_keyboard: true } : {}),
			...(this.#placeholder !== undefined ? { input_field_placeholder: this.#placeholder } : {}),
			...(this.#selective ? { selective: true } : {}),
		};
	}

	/** lets `JSON.stringify` (and thus `Api`, which stringifies `reply_markup`) accept the builder directly. */
	toJSON(): ReplyKeyboardMarkup {
		return this.build();
	}

	/** makes the builder structurally satisfy `ReplyKeyboardMarkup`, so typed `reply_markup` params take it directly. */
	get keyboard(): KeyboardButton[][] {
		return this.build().keyboard;
	}

	/** `reply_markup` that hides the current custom keyboard. */
	static remove(selective = false): ReplyKeyboardRemove {
		return selective ? { remove_keyboard: true, selective: true } : { remove_keyboard: true };
	}

	/** `reply_markup` that opens a reply input for the message. */
	static forceReply(options: Omit<ForceReply, "force_reply"> = {}): ForceReply {
		return { force_reply: true, ...options };
	}
}
