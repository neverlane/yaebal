import type { Chat, Message } from "@yaebal/core";
import type { ActorHost, SendText } from "./internal.js";
import { resolveSendText } from "./internal.js";
import { createUpdate } from "./updates.js";
import type { UserActor } from "./user-actor.js";

export type ChatType = "private" | "group" | "supergroup" | "channel";

export interface CreateChatOptions {
	type: ChatType;
	id?: number;
	title?: string;
	username?: string;
}

/** a chat member's tracked status — set via {@link ChatActor.setMembership}. */
export interface ChatMembership {
	status: string;
	since?: number;
}

let chatIdCounter = -1000;

/**
 * a passive container actors send into — a group/supergroup/channel/private chat. tracks who's
 * currently a member (best-effort — nothing enforces it unless you opt into `strictMembership`
 * via {@link createTestEnv}) and every message dispatched through it.
 */
export class ChatActor {
	readonly id: number;
	readonly type: ChatType;
	readonly title?: string;
	readonly username?: string;
	readonly members = new Set<UserActor>();
	readonly messages: unknown[] = [];

	private readonly host: ActorHost;
	private readonly membership = new Map<number, ChatMembership>();

	constructor(host: ActorHost, options: CreateChatOptions) {
		this.host = host;
		this.id = options.id ?? chatIdCounter--;
		this.type = options.type;
		this.title = options.title;
		this.username = options.username;
	}

	/** reconstruct a `ChatActor` from a raw `Chat` payload seen on an update (e.g. to find the chat a message you didn't create arrived in). not registered with any `TestEnv`. */
	static fromChat(host: ActorHost, chat: Chat): ChatActor {
		return new ChatActor(host, {
			type: chat.type as ChatType,
			id: chat.id,
			title: chat.title,
			username: chat.username,
		});
	}

	/** this chat as a plain {@link Chat} payload, ready to embed in an update. */
	toChat(): Chat {
		return {
			id: this.id,
			type: this.type,
			...(this.title !== undefined ? { title: this.title } : {}),
			...(this.username !== undefined ? { username: this.username } : {}),
		};
	}

	/** record (or update) a member's status — used by `strictMembership` and `getChatMember`-style assertions. */
	setMembership(userId: number, membership: ChatMembership): void {
		this.membership.set(userId, membership);
	}

	/** the tracked membership for a user, or `undefined` if never set. */
	membershipOf(user: UserActor): ChatMembership | undefined {
		return this.membership.get(user.id);
	}

	/**
	 * an anonymous channel post — `update.channel_post`, with no `from` (matching real Telegram:
	 * channel posts aren't attributed to a user). throws on non-channel chats.
	 */
	async post(text: SendText): Promise<Message> {
		if (this.type !== "channel") {
			throw new Error("ChatActor.post(): only channel chats can post — did you mean a user actor?");
		}

		const { text: resolvedText, entities } = resolveSendText(text);
		const message = {
			message_id: this.host.nextMessageId(),
			date: this.host.now(),
			chat: this.toChat(),
			text: resolvedText,
			...(entities.length ? { entities } : {}),
		};

		this.messages.push(message);
		await this.host.dispatch(createUpdate({ channel_post: message }));

		return message as Message;
	}
}
