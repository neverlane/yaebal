// Minimal keyboard types (self-contained until @yaebal/types codegen lands).

export interface InlineKeyboardButton {
	text: string;
	callback_data?: string;
	url?: string;
	web_app?: { url: string };
	switch_inline_query?: string;
}

export interface InlineKeyboardMarkup {
	inline_keyboard: InlineKeyboardButton[][];
}

export interface KeyboardButton {
	text: string;
	request_contact?: boolean;
	request_location?: boolean;
}

export interface ReplyKeyboardMarkup {
	keyboard: KeyboardButton[][];
	resize_keyboard?: boolean;
	one_time_keyboard?: boolean;
}

/** Fluent inline keyboard. `.row()` ends a row; buttons accumulate into the current one. */
export class InlineKeyboard {
	#rows: InlineKeyboardButton[][] = [];
	#current: InlineKeyboardButton[] = [];

	text(label: string, data: string): this {
		this.#current.push({ text: label, callback_data: data });
		return this;
	}

	url(label: string, url: string): this {
		this.#current.push({ text: label, url });
		return this;
	}

	webApp(label: string, url: string): this {
		this.#current.push({ text: label, web_app: { url } });
		return this;
	}

	switchInline(label: string, query = ""): this {
		this.#current.push({ text: label, switch_inline_query: query });
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
		// Clone so a returned markup never aliases the live in-progress row.
		const rows = this.#current.length > 0 ? [...this.#rows, [...this.#current]] : [...this.#rows];
		return { inline_keyboard: rows };
	}
}

/** Fluent reply keyboard with resize / one-time flags. */
export class Keyboard {
	#rows: KeyboardButton[][] = [];
	#current: KeyboardButton[] = [];
	#resize = false;
	#oneTime = false;

	text(label: string): this {
		this.#current.push({ text: label });
		return this;
	}

	requestContact(label: string): this {
		this.#current.push({ text: label, request_contact: true });
		return this;
	}

	requestLocation(label: string): this {
		this.#current.push({ text: label, request_location: true });
		return this;
	}

	row(): this {
		if (this.#current.length > 0) {
			this.#rows.push(this.#current);
			this.#current = [];
		}
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

	build(): ReplyKeyboardMarkup {
		// Clone so a returned markup never aliases the live in-progress row.
		const keyboard =
			this.#current.length > 0 ? [...this.#rows, [...this.#current]] : [...this.#rows];
		return {
			keyboard,
			...(this.#resize ? { resize_keyboard: true } : {}),
			...(this.#oneTime ? { one_time_keyboard: true } : {}),
		};
	}
}
