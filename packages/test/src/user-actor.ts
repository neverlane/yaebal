import type { Message, MessageEntity, Update, User } from "@yaebal/core";
import { ChatActor } from "./chat-actor.js";
import type { ActorHost, SendText } from "./internal.js";
import { fakeFile, resolveSendText } from "./internal.js";
import { findButton } from "./keyboard.js";
import { reactionsOf } from "./reactions.js";
import { buildUser, createUpdate } from "./updates.js";

/** shapes not separately exported by `@yaebal/core` — derived structurally from `Message`/`Update` instead of adding a `@yaebal/types` dependency just for names. */
type MessageField<K extends keyof Message> = NonNullable<Message[K]>;
type UpdateField<K extends keyof Update> = NonNullable<Update[K]>;
type Location = MessageField<"location">;
type Contact = MessageField<"contact">;
type Venue = MessageField<"venue">;
type SuccessfulPayment = MessageField<"successful_payment">;
type PreCheckoutQuery = UpdateField<"pre_checkout_query">;
type ShippingQuery = UpdateField<"shipping_query">;

/** options shared by `sendMessage`/`sendReply`/`editMessage`. */
export interface MessageOptions {
	/** extra entities to merge in alongside whatever `text` (as a `format` result) already carries. */
	entities?: MessageEntity[];
	/** sets `reply_to_message`. */
	replyTo?: Message;
}

/** options shared by the media-sending shortcuts (`sendPhoto`, `sendVideo`, ...). */
export interface MediaOptions {
	/** caption — a plain string or a `format`/`fmt` result (entities auto-extracted). */
	caption?: SendText;
	/** sets `has_media_spoiler = true`. */
	spoiler?: boolean;
}

type ChatArg = ChatActor | undefined;

function resolveArgs<Opts>(
	a: ChatArg | Opts,
	b: Opts | undefined,
	pm: ChatActor,
): [ChatActor, Opts] {
	if (a instanceof ChatActor) return [a, (b ?? {}) as Opts];
	return [pm, (a ?? {}) as Opts];
}

function captionFields(caption: SendText | undefined): Record<string, unknown> {
	if (caption === undefined) return {};
	const { text, entities } = resolveSendText(caption);
	return { caption: text, ...(entities.length ? { caption_entities: entities } : {}) };
}

/**
 * a user actor — the primary way to drive a test scenario. every method emits the update a real
 * Telegram user's action would produce, then dispatches it through the bot under test.
 */
export class UserActor {
	readonly id: number;
	readonly payload: User;
	readonly pmChat: ChatActor;

	private readonly host: ActorHost;

	constructor(host: ActorHost, payload: User) {
		this.host = host;
		this.payload = payload;
		this.id = payload.id;
		this.pmChat = new ChatActor(host, { type: "private", id: payload.id });
	}

	/** scope every send/click/react to a specific chat. */
	in(chat: ChatActor): UserInChatScope {
		return new UserInChatScope(this, chat);
	}

	/** scope click/react/edit to a specific message (its own chat is inferred). */
	on(message: Message): UserOnMessageScope {
		return new UserOnMessageScope(this, message);
	}

	private buildMessage(chat: ChatActor, fields: Partial<Message>): Message {
		const message = {
			message_id: this.host.nextMessageId(),
			date: this.host.now(),
			chat: chat.toChat(),
			from: this.payload,
			...fields,
		} as Message;

		chat.messages.push(message);
		return message;
	}

	private async dispatchMessage(message: Message): Promise<Message> {
		await this.host.dispatch(createUpdate({ message }));
		return message;
	}

	/** send a text message — to the user's own PM by default, or into `chat` if given first. */
	sendMessage(text: SendText, options?: MessageOptions): Promise<Message>;
	sendMessage(chat: ChatActor, text: SendText, options?: MessageOptions): Promise<Message>;
	sendMessage(
		a: ChatActor | SendText,
		b?: SendText | MessageOptions,
		c?: MessageOptions,
	): Promise<Message> {
		const chat = a instanceof ChatActor ? a : this.pmChat;
		const text = (a instanceof ChatActor ? b : a) as SendText;
		const options = (a instanceof ChatActor ? c : b) as MessageOptions | undefined;

		const { text: resolvedText, entities } = resolveSendText(text, options?.entities ?? []);
		const message = this.buildMessage(chat, {
			text: resolvedText,
			...(entities.length ? { entities } : {}),
			...(options?.replyTo ? { reply_to_message: options.replyTo } : {}),
		});

		return this.dispatchMessage(message);
	}

	/** reply to `message` — same chat, `reply_to_message` set automatically. */
	sendReply(message: Message, text: SendText): Promise<Message> {
		const chat = this.chatOf(message);
		return this.sendMessage(chat, text, { replyTo: message });
	}

	/** send `/name args` — a `bot_command` entity is attached automatically. */
	sendCommand(name: string, args?: string): Promise<Message>;
	sendCommand(chat: ChatActor, name: string, args?: string): Promise<Message>;
	sendCommand(a: ChatActor | string, b?: string, c?: string): Promise<Message> {
		const chat = a instanceof ChatActor ? a : this.pmChat;
		const name = (a instanceof ChatActor ? b : a) as string;
		const args = a instanceof ChatActor ? c : (b as string | undefined);

		const command = `/${name}`;
		const text = args ? `${command} ${args}` : command;
		const entity: MessageEntity = { type: "bot_command", offset: 0, length: command.length };

		return this.sendMessage(chat, { text, entities: [entity] });
	}

	private mediaAttachment(
		chatOrOverrides: ChatArg | MediaOptions,
		overrides: MediaOptions | undefined,
		fields: Record<string, unknown>,
	): Promise<Message> {
		const [chat, options] = resolveArgs<MediaOptions>(chatOrOverrides, overrides, this.pmChat);

		const message = this.buildMessage(chat, {
			...fields,
			...captionFields(options.caption),
			...(options.spoiler ? { has_media_spoiler: true } : {}),
		} as Partial<Message>);

		return this.dispatchMessage(message);
	}

	sendPhoto(chat?: ChatActor, overrides?: MediaOptions): Promise<Message>;
	sendPhoto(overrides?: MediaOptions): Promise<Message>;
	sendPhoto(a?: ChatArg | MediaOptions, b?: MediaOptions): Promise<Message> {
		return this.mediaAttachment(a, b, {
			photo: [
				{ ...fakeFile("photo"), width: 100, height: 100 },
				{ ...fakeFile("photo"), width: 800, height: 600 },
			],
		});
	}

	sendVideo(chat?: ChatActor, overrides?: MediaOptions): Promise<Message>;
	sendVideo(overrides?: MediaOptions): Promise<Message>;
	sendVideo(a?: ChatArg | MediaOptions, b?: MediaOptions): Promise<Message> {
		return this.mediaAttachment(a, b, {
			video: { ...fakeFile("video"), width: 1280, height: 720, duration: 10 },
		});
	}

	sendDocument(chat?: ChatActor, overrides?: MediaOptions): Promise<Message>;
	sendDocument(overrides?: MediaOptions): Promise<Message>;
	sendDocument(a?: ChatArg | MediaOptions, b?: MediaOptions): Promise<Message> {
		return this.mediaAttachment(a, b, { document: { ...fakeFile("doc"), file_name: "file.bin" } });
	}

	sendVoice(chat?: ChatActor, overrides?: MediaOptions): Promise<Message>;
	sendVoice(overrides?: MediaOptions): Promise<Message>;
	sendVoice(a?: ChatArg | MediaOptions, b?: MediaOptions): Promise<Message> {
		return this.mediaAttachment(a, b, { voice: { ...fakeFile("voice"), duration: 5 } });
	}

	sendAudio(chat?: ChatActor, overrides?: MediaOptions): Promise<Message>;
	sendAudio(overrides?: MediaOptions): Promise<Message>;
	sendAudio(a?: ChatArg | MediaOptions, b?: MediaOptions): Promise<Message> {
		return this.mediaAttachment(a, b, { audio: { ...fakeFile("audio"), duration: 30 } });
	}

	sendAnimation(chat?: ChatActor, overrides?: MediaOptions): Promise<Message>;
	sendAnimation(overrides?: MediaOptions): Promise<Message>;
	sendAnimation(a?: ChatArg | MediaOptions, b?: MediaOptions): Promise<Message> {
		return this.mediaAttachment(a, b, {
			animation: { ...fakeFile("gif"), width: 480, height: 270, duration: 3 },
		});
	}

	sendVideoNote(chat?: ChatActor, overrides?: MediaOptions): Promise<Message>;
	sendVideoNote(overrides?: MediaOptions): Promise<Message>;
	sendVideoNote(a?: ChatArg | MediaOptions, b?: MediaOptions): Promise<Message> {
		return this.mediaAttachment(a, b, {
			video_note: { ...fakeFile("videonote"), length: 240, duration: 10 },
		});
	}

	sendSticker(chat?: ChatActor, overrides?: Partial<Message["sticker"]>): Promise<Message>;
	sendSticker(overrides?: Partial<Message["sticker"]>): Promise<Message>;
	sendSticker(
		a?: ChatArg | Partial<Message["sticker"]>,
		b?: Partial<Message["sticker"]>,
	): Promise<Message> {
		const [chat, overrides] = resolveArgs<Partial<Message["sticker"]>>(a, b, this.pmChat);
		const message = this.buildMessage(chat, {
			sticker: {
				...fakeFile("sticker"),
				type: "regular",
				width: 512,
				height: 512,
				is_animated: false,
				is_video: false,
				...overrides,
			},
		} as Partial<Message>);

		return this.dispatchMessage(message);
	}

	sendLocation(
		location: Partial<Location> & { latitude: number; longitude: number },
		chat?: ChatActor,
	): Promise<Message>;
	sendLocation(
		chat: ChatActor,
		location: Partial<Location> & { latitude: number; longitude: number },
	): Promise<Message>;
	sendLocation(
		a: ChatActor | (Partial<Location> & { latitude: number; longitude: number }),
		b?: ChatActor | (Partial<Location> & { latitude: number; longitude: number }),
	): Promise<Message> {
		const chat = a instanceof ChatActor ? a : this.pmChat;
		const location = (a instanceof ChatActor ? b : a) as Location;

		return this.dispatchMessage(this.buildMessage(chat, { location } as Partial<Message>));
	}

	sendContact(
		contact: Partial<Contact> & { phone_number: string; first_name: string },
		chat?: ChatActor,
	): Promise<Message>;
	sendContact(
		chat: ChatActor,
		contact: Partial<Contact> & { phone_number: string; first_name: string },
	): Promise<Message>;
	sendContact(
		a: ChatActor | (Partial<Contact> & { phone_number: string; first_name: string }),
		b?: ChatActor | (Partial<Contact> & { phone_number: string; first_name: string }),
	): Promise<Message> {
		const chat = a instanceof ChatActor ? a : this.pmChat;
		const contact = (a instanceof ChatActor ? b : a) as Contact;

		return this.dispatchMessage(this.buildMessage(chat, { contact } as Partial<Message>));
	}

	sendVenue(
		venue: Partial<Venue> & { location: Location; title: string; address: string },
		chat?: ChatActor,
	): Promise<Message>;
	sendVenue(
		chat: ChatActor,
		venue: Partial<Venue> & { location: Location; title: string; address: string },
	): Promise<Message>;
	sendVenue(
		a: ChatActor | (Partial<Venue> & { location: Location; title: string; address: string }),
		b?: ChatActor | (Partial<Venue> & { location: Location; title: string; address: string }),
	): Promise<Message> {
		const chat = a instanceof ChatActor ? a : this.pmChat;
		const venue = (a instanceof ChatActor ? b : a) as Venue;

		return this.dispatchMessage(this.buildMessage(chat, { venue } as Partial<Message>));
	}

	sendDice(chat?: ChatActor, emoji?: string): Promise<Message>;
	sendDice(emoji?: string): Promise<Message>;
	sendDice(a?: ChatArg | string, b?: string): Promise<Message> {
		const chat = a instanceof ChatActor ? a : this.pmChat;
		const emoji = (a instanceof ChatActor ? b : a) ?? "🎲";
		const faces: Record<string, number> = { "🎯": 6, "🏀": 5, "⚽": 5, "🎳": 6, "🎰": 64 };
		const value = 1 + Math.floor(Math.random() * (faces[emoji] ?? 6));

		return this.dispatchMessage(
			this.buildMessage(chat, { dice: { emoji, value } } as Partial<Message>),
		);
	}

	/** send several media items as one album — one `message` update per item, sharing `media_group_id`. */
	async sendMediaGroup(chat: ChatActor, items: Array<Partial<Message>>): Promise<Message[]> {
		const groupId = `mg_${this.host.nextMessageId()}`;
		const out: Message[] = [];

		for (const item of items) {
			const message = this.buildMessage(chat, {
				...item,
				media_group_id: groupId,
			} as Partial<Message>);
			out.push(await this.dispatchMessage(message));
		}

		return out;
	}

	private chatOf(message: Message): ChatActor {
		return message.chat.id === this.pmChat.id
			? this.pmChat
			: ChatActor.fromChat(this.host, message.chat);
	}

	/** edit a message's text in place — dispatches `edited_message`; `ctx.updatedAt` (if your context exposes it) reflects the new `edit_date`. */
	async editMessage(message: Message, text: SendText): Promise<Message> {
		const { text: resolvedText, entities } = resolveSendText(text);

		const edited = {
			...message,
			text: resolvedText,
			...(entities.length ? { entities } : { entities: undefined }),
			edit_date: this.host.now(),
		} as Message;

		await this.host.dispatch(createUpdate({ edited_message: edited }));
		return edited;
	}

	/** forward `message` — to the user's own PM by default, or to `toChat`. */
	async forwardMessage(message: Message, toChat?: ChatActor): Promise<Message> {
		const chat = toChat ?? this.pmChat;
		const { message_id: _id, date: _date, chat: _chat, from, ...content } = message;

		const forwarded = this.buildMessage(chat, {
			...content,
			forward_origin: from
				? { type: "user", date: message.date, sender_user: from }
				: {
						type: "channel",
						date: message.date,
						chat: message.chat,
						message_id: message.message_id,
					},
		} as Partial<Message>);

		return this.dispatchMessage(forwarded);
	}

	/** pin `message` — dispatches a service `message` update with `pinned_message` set. */
	async pinMessage(message: Message, inChat?: ChatActor): Promise<Message> {
		const chat = inChat ?? this.chatOf(message);
		const service = this.buildMessage(chat, { pinned_message: message } as Partial<Message>);

		return this.dispatchMessage(service);
	}

	/** click an inline button by its `callback_data` — dispatches `callback_query`. */
	async click(callbackData: string, message?: Message): Promise<void> {
		const msg = message ?? this.buildMessage(this.pmChat, {});

		await this.host.dispatch(
			createUpdate({
				callback_query: {
					id: String(this.host.nextMessageId()),
					chat_instance: "0",
					from: this.payload,
					data: callbackData,
					message: msg,
				},
			}),
		);
	}

	/** react to `message` with one or more emojis — `old_reaction` is inferred from this user's last reaction on it. pass `[]` to clear. */
	async react(emojis: string | string[], message: Message): Promise<void> {
		const newReaction = Array.isArray(emojis) ? emojis : [emojis];
		const state = reactionsOf(message);
		const oldReaction = state.get(this.id) ?? [];

		if (newReaction.length === 0) state.delete(this.id);
		else state.set(this.id, newReaction);

		await this.host.dispatch(
			createUpdate({
				message_reaction: {
					chat: message.chat,
					message_id: message.message_id,
					user: this.payload,
					date: this.host.now(),
					old_reaction: oldReaction.map((emoji) => ({ type: "emoji", emoji })),
					new_reaction: newReaction.map((emoji) => ({ type: "emoji", emoji })),
				},
			}),
		);
	}

	/** join `chat` — emits `chat_member` (membership change) and a `new_chat_members` service message. */
	async join(chat: ChatActor): Promise<void> {
		chat.members.add(this);
		chat.setMembership(this.id, { status: "member", since: this.host.now() });

		await this.host.dispatch(
			createUpdate({
				chat_member: {
					chat: chat.toChat(),
					from: this.payload,
					date: this.host.now(),
					old_chat_member: { status: "left", user: this.payload },
					new_chat_member: { status: "member", user: this.payload },
				},
			}),
		);

		await this.dispatchMessage(
			this.buildMessage(chat, { new_chat_members: [this.payload] } as Partial<Message>),
		);
	}

	/** leave `chat` — emits `chat_member` (membership change) and a `left_chat_member` service message. */
	async leave(chat: ChatActor): Promise<void> {
		chat.members.delete(this);
		chat.setMembership(this.id, { status: "left", since: this.host.now() });

		await this.host.dispatch(
			createUpdate({
				chat_member: {
					chat: chat.toChat(),
					from: this.payload,
					date: this.host.now(),
					old_chat_member: { status: "member", user: this.payload },
					new_chat_member: { status: "left", user: this.payload },
				},
			}),
		);

		await this.dispatchMessage(
			this.buildMessage(chat, { left_chat_member: this.payload } as Partial<Message>),
		);
	}

	/** send an inline query — pass a `ChatActor` to set `chat_type` automatically. */
	async sendInlineQuery(
		query: string,
		chatOrOptions?: ChatActor | { offset?: string },
		options?: { offset?: string },
	): Promise<void> {
		const chat = chatOrOptions instanceof ChatActor ? chatOrOptions : undefined;
		const opts = (chatOrOptions instanceof ChatActor ? options : chatOrOptions) ?? {};

		await this.host.dispatch(
			createUpdate({
				inline_query: {
					id: String(this.host.nextMessageId()),
					from: this.payload,
					query,
					offset: opts.offset ?? "",
					...(chat ? { chat_type: chat.type === "private" ? "private" : chat.type } : {}),
				},
			}),
		);
	}

	/** choose a result from a previous inline query — dispatches `chosen_inline_result`. */
	async chooseInlineResult(
		resultId: string,
		query: string,
		options: { inlineMessageId?: string } = {},
	): Promise<void> {
		await this.host.dispatch(
			createUpdate({
				chosen_inline_result: {
					result_id: resultId,
					from: this.payload,
					query,
					...(options.inlineMessageId ? { inline_message_id: options.inlineMessageId } : {}),
				},
			}),
		);
	}

	/** emit a `pre_checkout_query` — the bot is expected to `answerPreCheckoutQuery`. */
	async sendPreCheckoutQuery(overrides: Partial<PreCheckoutQuery> = {}): Promise<PreCheckoutQuery> {
		const query: PreCheckoutQuery = {
			id: String(this.host.nextMessageId()),
			from: this.payload,
			currency: "XTR",
			total_amount: 100,
			invoice_payload: "payload",
			...overrides,
		};

		await this.host.dispatch(createUpdate({ pre_checkout_query: query }));
		return query;
	}

	/** emit a `shipping_query`. default shipping address is New York, US. */
	async sendShippingQuery(overrides: Partial<ShippingQuery> = {}): Promise<ShippingQuery> {
		const query: ShippingQuery = {
			id: String(this.host.nextMessageId()),
			from: this.payload,
			invoice_payload: "payload",
			shipping_address: {
				country_code: "US",
				state: "",
				city: "New York",
				street_line1: "",
				street_line2: "",
				post_code: "10001",
			},
			...overrides,
		};

		await this.host.dispatch(createUpdate({ shipping_query: query }));
		return query;
	}

	/**
	 * the full payments flow: emits `pre_checkout_query`, then throws unless the bot answered it
	 * with `ok: true` (real Telegram never sends `successful_payment` otherwise), then dispatches
	 * a `message` update carrying `successful_payment`.
	 */
	async sendSuccessfulPayment(
		chatOrOverrides?: ChatActor | Partial<SuccessfulPayment>,
		overrides?: Partial<SuccessfulPayment>,
	): Promise<Message> {
		const [chat, payment] = resolveArgs<Partial<SuccessfulPayment>>(
			chatOrOverrides,
			overrides,
			this.pmChat,
		);

		const preCheckout = await this.sendPreCheckoutQuery({
			currency: payment.currency,
			total_amount: payment.total_amount,
			invoice_payload: payment.invoice_payload,
		});

		const approved = this.host.answeredPreCheckoutQuery(preCheckout.id);
		if (!approved) {
			throw new Error(
				"sendSuccessfulPayment(): the bot never answered the pre_checkout_query with { ok: true } — " +
					"real Telegram would never send successful_payment in that case",
			);
		}

		const message = this.buildMessage(chat, {
			successful_payment: {
				currency: "XTR",
				total_amount: 100,
				invoice_payload: "payload",
				...payment,
			},
		} as Partial<Message>);

		return this.dispatchMessage(message);
	}
}

/** returned by {@link UserActor.in} — every method delegates to the underlying user, pre-bound to `chat`. */
export class UserInChatScope {
	constructor(
		private readonly user: UserActor,
		private readonly chat: ChatActor,
	) {}

	sendMessage(text: SendText, options?: MessageOptions): Promise<Message> {
		return this.user.sendMessage(this.chat, text, options);
	}

	sendReply(message: Message, text: SendText): Promise<Message> {
		return this.user.sendReply(message, text);
	}

	sendCommand(name: string, args?: string): Promise<Message> {
		return this.user.sendCommand(this.chat, name, args);
	}

	sendPhoto(overrides?: MediaOptions): Promise<Message> {
		return this.user.sendPhoto(this.chat, overrides);
	}

	sendVideo(overrides?: MediaOptions): Promise<Message> {
		return this.user.sendVideo(this.chat, overrides);
	}

	sendDocument(overrides?: MediaOptions): Promise<Message> {
		return this.user.sendDocument(this.chat, overrides);
	}

	sendVoice(overrides?: MediaOptions): Promise<Message> {
		return this.user.sendVoice(this.chat, overrides);
	}

	sendAudio(overrides?: MediaOptions): Promise<Message> {
		return this.user.sendAudio(this.chat, overrides);
	}

	sendAnimation(overrides?: MediaOptions): Promise<Message> {
		return this.user.sendAnimation(this.chat, overrides);
	}

	sendVideoNote(overrides?: MediaOptions): Promise<Message> {
		return this.user.sendVideoNote(this.chat, overrides);
	}

	sendSticker(overrides?: Partial<Message["sticker"]>): Promise<Message> {
		return this.user.sendSticker(this.chat, overrides);
	}

	sendLocation(
		location: Partial<Location> & { latitude: number; longitude: number },
	): Promise<Message> {
		return this.user.sendLocation(this.chat, location);
	}

	sendContact(
		contact: Partial<Contact> & { phone_number: string; first_name: string },
	): Promise<Message> {
		return this.user.sendContact(this.chat, contact);
	}

	sendVenue(
		venue: Partial<Venue> & { location: Location; title: string; address: string },
	): Promise<Message> {
		return this.user.sendVenue(this.chat, venue);
	}

	sendDice(emoji?: string): Promise<Message> {
		return this.user.sendDice(this.chat, emoji);
	}

	sendMediaGroup(items: Array<Partial<Message>>): Promise<Message[]> {
		return this.user.sendMediaGroup(this.chat, items);
	}

	sendInlineQuery(query: string, options?: { offset?: string }): Promise<void> {
		return this.user.sendInlineQuery(query, this.chat, options);
	}

	sendSuccessfulPayment(overrides?: Partial<SuccessfulPayment>): Promise<Message> {
		return this.user.sendSuccessfulPayment(this.chat, overrides);
	}

	join(): Promise<void> {
		return this.user.join(this.chat);
	}

	leave(): Promise<void> {
		return this.user.leave(this.chat);
	}

	on(message: Message): UserOnMessageScope {
		return this.user.on(message);
	}
}

/** returned by {@link UserActor.on} — click/react/edit pre-bound to `message`. */
export class UserOnMessageScope {
	constructor(
		private readonly user: UserActor,
		private readonly message: Message,
	) {}

	click(callbackData: string): Promise<void> {
		return this.user.click(callbackData, this.message);
	}

	/** find a button by its label (string or regex) in `message`'s inline keyboard and click it. throws if none match. */
	clickByText(match: string | RegExp): Promise<void> {
		const button = findButton((this.message as { reply_markup?: unknown }).reply_markup, match);
		if (!button) {
			throw new Error(`clickByText(): no inline button matching ${String(match)} on this message`);
		}

		return this.user.click(String(button.callback_data), this.message);
	}

	react(emojis: string | string[]): Promise<void> {
		return this.user.react(emojis, this.message);
	}

	editMessage(text: SendText): Promise<Message> {
		return this.user.editMessage(this.message, text);
	}

	forwardMessage(toChat?: ChatActor): Promise<Message> {
		return this.user.forwardMessage(this.message, toChat);
	}

	pinMessage(inChat?: ChatActor): Promise<Message> {
		return this.user.pinMessage(this.message, inChat);
	}
}

export { buildUser };
