import assert from "node:assert/strict";
import test from "node:test";
import {
	Composer,
	Context,
	type Filter,
	type Message,
	type MessageEntity,
	type Update,
	type UpdateName,
	type User,
} from "@yaebal/core";
import {
	callbackUpdate,
	chatMemberUpdate,
	createTestEnv,
	createUpdate,
	detectUpdateType,
	editedMessageUpdate,
	inlineQueryUpdate,
	messageUpdate,
	myChatMemberUpdate,
} from "@yaebal/test";
import {
	and,
	callbackData,
	chatId,
	chatMemberStatus,
	chatType,
	command,
	contains,
	deeplink,
	defineFilter,
	edited,
	endsWith,
	equals,
	filters,
	forward,
	forwardOrigin,
	fromBot,
	fromUser,
	hasEntity,
	inlineQuery,
	isForum,
	isPremium,
	isPrivate,
	media,
	mediaType,
	not,
	or,
	photo,
	regex,
	reply,
	service,
	start,
	startsWith,
	text,
	viaBot,
} from "./index.js";

const stubApi = null as unknown as Context["api"];

/** build a context straight from an update — filters are plain functions, so unit tests call them directly. */
const ctxOf = (update: Update, me?: User) =>
	new Context({ api: stubApi, update, updateType: detectUpdateType(update) as UpdateName, me });

/** run a filter against an update; returns the verdict and whatever it staged. */
async function check(
	filter: Filter<Context, object>,
	update: Update,
	me?: User,
): Promise<{ ok: boolean; bag: Record<string, unknown> }> {
	const bag: Record<string, unknown> = {};
	const ok = await (filter as Filter<Context>)(ctxOf(update, me), bag);
	return { ok, bag };
}

/** a message update with arbitrary extra message fields (media, captions, entities, …). */
const msg = (fields: Partial<Message>): Update =>
	createUpdate({
		message: {
			message_id: 1,
			date: 0,
			chat: { id: 10, type: "private" },
			from: { id: 1, is_bot: false, first_name: "u" },
			...fields,
		} as Message,
	});

const photoSize = [{ file_id: "f", file_unique_id: "f", width: 1, height: 1 }];

// ── combinators ──────────────────────────────────────────────────────────────

test("and: all must match, additions from every member are committed", async () => {
	let seen = "";
	const bot = new Composer<Context>().filter(
		and(isPrivate, command("buy"), regex(/(\d+)/)),
		(ctx) => {
			// compile-time: command's and regex's additions are both visible
			seen = `${ctx.command}:${ctx.args.join(",")}:${ctx.match[1]}`;
		},
	);
	const env = createTestEnv(bot);

	await env.dispatch(messageUpdate({ text: "/buy 42" }));
	assert.equal(seen, "buy:42:42");

	seen = "";
	await env.dispatch(messageUpdate({ text: "/buy 42", chatType: "group" }));
	assert.equal(seen, "", "non-private chat must not pass and(isPrivate, …)");
});

test("and: later members see what earlier members staged (shared bag)", async () => {
	const inspector = defineFilter((_ctx, bag: Record<string, unknown>) => {
		return (bag as { command?: string }).command === "go";
	});

	assert.equal((await check(and(command(), inspector), messageUpdate({ text: "/go" }))).ok, true);
	assert.equal((await check(and(command(), inspector), messageUpdate({ text: "/no" }))).ok, false);
});

test("a rejecting filter never corrupts data an earlier filter committed", async () => {
	const seen: string[] = [];
	const bot = new Composer<Context>()
		.filter(regex(/price (\d+)/), (ctx, next) => {
			seen.push(`first:${ctx.match[1]}`);
			return next();
		})
		// regex(/(usd|eur)/) matches and stages its own match — not() rejects, and
		// the staged match must evaporate instead of overwriting ctx.match
		.filter(not(regex(/(usd|eur)/)), () => {
			seen.push("second");
		})
		.use((ctx) => {
			seen.push(`after:${(ctx as Context & { match?: RegExpMatchArray }).match?.[1]}`);
		});

	await createTestEnv(bot).dispatch(messageUpdate({ text: "price 100 usd" }));
	assert.deepEqual(seen, ["first:100", "after:100"]);
});

test("or: first matching branch wins; a failed branch's staged data never leaks", async () => {
	const failing = and(regex(/(usd)/), () => false); // stages a match, then rejects
	const { ok, bag } = await check(or(failing, regex(/(\d+)/)), messageUpdate({ text: "100 usd" }));

	assert.equal(ok, true);
	assert.equal((bag.match as RegExpMatchArray)[1], "100");
});

test("or: no branch matching means no additions at all", async () => {
	const { ok, bag } = await check(or(command("a"), command("b")), messageUpdate({ text: "/c" }));

	assert.equal(ok, false);
	assert.deepEqual(bag, {});
});

test("not: inverts, discards inner staged data", async () => {
	assert.equal((await check(not(command("a")), messageUpdate({ text: "/a" }))).ok, false);

	const { ok, bag } = await check(not(command("a")), messageUpdate({ text: "/b" }));
	assert.equal(ok, true);
	assert.deepEqual(bag, {}, "not() must never expose the inner filter's staged fields");
});

test("empty combinators: and() matches everything, or() matches nothing", async () => {
	assert.equal((await check(and(), messageUpdate())).ok, true);
	assert.equal((await check(or(), messageUpdate())).ok, false);
});

test("async filters compose with sync ones, in order, short-circuiting", async () => {
	const calls: string[] = [];
	const asyncYes = defineFilter(async (_ctx, _bag) => {
		calls.push("async");
		await Promise.resolve();
		return true;
	});
	const syncNo = (_ctx: Context) => {
		calls.push("sync");
		return false;
	};
	const unreachable = () => {
		calls.push("unreachable");
		return true;
	};

	assert.equal((await check(and(asyncYes, syncNo, unreachable), messageUpdate())).ok, false);
	assert.deepEqual(calls, ["async", "sync"]);

	calls.length = 0;
	assert.equal((await check(or(syncNo, asyncYes, unreachable), messageUpdate())).ok, true);
	assert.deepEqual(calls, ["sync", "async"]);
});

test("defineFilter: async filter stages typed data, committed only on a full match", async () => {
	const vip = defineFilter<{ rank: number }>(async (ctx, bag) => {
		await Promise.resolve();
		if (ctx.from?.id !== 1) return false;
		bag.rank = 9000;
		return true;
	});

	let rank = 0;
	const bot = new Composer<Context>().filter(and(vip, text), (ctx) => {
		rank = ctx.rank; // compile-time: defineFilter's Add flows through and()
	});

	await createTestEnv(bot).dispatch(messageUpdate({ text: "hi", fromId: 1, chatId: 1 }));
	assert.equal(rank, 9000);
});

// ── text ─────────────────────────────────────────────────────────────────────

test("text: non-empty text or caption, nothing else", async () => {
	assert.equal((await check(text, messageUpdate({ text: "hi" }))).ok, true);
	assert.equal((await check(text, msg({ caption: "pic", photo: photoSize }))).ok, true);
	assert.equal((await check(text, msg({ photo: photoSize }))).ok, false);
	assert.equal((await check(text, callbackUpdate({ data: "x" }))).ok, false);
});

test("equals / contains / startsWith / endsWith, with ignoreCase", async () => {
	const u = messageUpdate({ text: "Hello World" });

	assert.equal((await check(equals("Hello World"), u)).ok, true);
	assert.equal((await check(equals("hello world"), u)).ok, false);
	assert.equal((await check(equals("hello world", { ignoreCase: true }), u)).ok, true);

	assert.equal((await check(contains("lo Wo"), u)).ok, true);
	assert.equal((await check(contains("LO WO", { ignoreCase: true }), u)).ok, true);
	assert.equal((await check(contains("bye"), u)).ok, false);

	assert.equal((await check(startsWith("Hello"), u)).ok, true);
	assert.equal((await check(startsWith("World"), u)).ok, false);

	assert.equal((await check(endsWith("World"), u)).ok, true);
	assert.equal((await check(endsWith("world", { ignoreCase: true }), u)).ok, true);
	assert.equal((await check(endsWith("Hello"), u)).ok, false);
});

test("regex: stages ctx.match; a shared sticky regex matches every update", async () => {
	const { ok, bag } = await check(regex(/buy (\d+)/), messageUpdate({ text: "buy 42" }));
	assert.equal(ok, true);
	assert.equal((bag.match as RegExpMatchArray)[1], "42");

	const sticky = regex(/\d+/y);
	assert.equal((await check(sticky, messageUpdate({ text: "123" }))).ok, true);
	assert.equal((await check(sticky, messageUpdate({ text: "123" }))).ok, true);
});

// ── commands ─────────────────────────────────────────────────────────────────

test("command: name, args, payload; case-insensitive by default", async () => {
	const { ok, bag } = await check(command("start"), messageUpdate({ text: "/START ref 42  " }));

	assert.equal(ok, true);
	assert.equal(bag.command, "start");
	assert.deepEqual(bag.args, ["ref", "42"]);
	assert.equal(bag.payload, "ref 42");

	const sensitive = await check(
		command("start", { caseSensitive: true }),
		messageUpdate({ text: "/START" }),
	);
	assert.equal(sensitive.ok, false);
});

test("command: multiple names, regex names (full match only, groups staged)", async () => {
	const multi = command(["stop", "halt"]);
	assert.equal((await check(multi, messageUpdate({ text: "/halt" }))).ok, true);
	assert.equal((await check(multi, messageUpdate({ text: "/go" }))).ok, false);

	const re = command(/set_(\d+)/);
	const hit = await check(re, messageUpdate({ text: "/set_5 x" }));
	assert.equal(hit.ok, true);
	assert.equal((hit.bag.match as RegExpMatchArray)[1], "5");

	assert.equal((await check(re, messageUpdate({ text: "/preset_5" }))).ok, false);
	assert.equal((await check(re, messageUpdate({ text: "/set_5extra" }))).ok, false);
});

test("command: custom prefixes", async () => {
	const bang = command("ban", { prefixes: ["!", "."] });

	assert.equal((await check(bang, messageUpdate({ text: "!ban spam" }))).ok, true);
	assert.equal((await check(bang, messageUpdate({ text: ".ban spam" }))).ok, true);
	assert.equal((await check(bang, messageUpdate({ text: "/ban spam" }))).ok, false);
});

test("command: @mention is checked against ctx.me when known", async () => {
	const me = { id: 42, is_bot: true, first_name: "b", username: "My_Bot" } as User;

	assert.equal((await check(command("hi"), messageUpdate({ text: "/hi@my_bot" }), me)).ok, true);
	assert.equal(
		(await check(command("hi"), messageUpdate({ text: "/hi@other_bot" }), me)).ok,
		false,
	);
	// webhook mode (me unknown) keeps accepting mentions, as core does
	assert.equal((await check(command("hi"), messageUpdate({ text: "/hi@whoever" }))).ok, true);
});

test("command: edited messages, captions, bare slashes and whitespace", async () => {
	assert.equal(
		(await check(command("start"), editedMessageUpdate({ text: "/start" }))).ok,
		false,
		"an edited /cmd must not re-fire",
	);
	assert.equal(
		(await check(command("start"), msg({ caption: "/start", photo: photoSize }))).ok,
		false,
		"a caption is not a command",
	);
	assert.equal((await check(command(), messageUpdate({ text: "/" }))).ok, false);
	assert.equal((await check(command(), messageUpdate({ text: "/ hm" }))).ok, false);

	const trailing = await check(command("buy"), messageUpdate({ text: "/buy " }));
	assert.equal(trailing.ok, true);
	assert.deepEqual(trailing.bag.args, []);
	assert.equal(trailing.bag.payload, "");
});

test("start and deeplink", async () => {
	assert.equal((await check(start, messageUpdate({ text: "/start" }))).ok, true);
	assert.equal(
		(await check(start, messageUpdate({ text: "/start", chatType: "group" }))).ok,
		false,
	);

	const promo = await check(deeplink("promo"), messageUpdate({ text: "/start promo" }));
	assert.equal(promo.ok, true);
	assert.equal(promo.bag.payload, "promo");

	assert.equal((await check(deeplink("promo"), messageUpdate({ text: "/start" }))).ok, false);
	assert.equal((await check(deeplink("promo"), messageUpdate({ text: "/start other" }))).ok, false);

	const ref = await check(deeplink(/^ref_(\d+)$/), messageUpdate({ text: "/start ref_42" }));
	assert.equal(ref.ok, true);
	assert.equal((ref.bag.match as RegExpMatchArray)[1], "42");
});

// ── peers ────────────────────────────────────────────────────────────────────

test("chatType / isForum", async () => {
	assert.equal((await check(chatType("private"), messageUpdate())).ok, true);
	assert.equal((await check(chatType("group", "supergroup"), messageUpdate())).ok, false);
	assert.equal(
		(await check(chatType("group", "supergroup"), messageUpdate({ chatType: "group" }))).ok,
		true,
	);

	const forum = msg({ chat: { id: 5, type: "supergroup", title: "t", is_forum: true } });
	assert.equal((await check(isForum, forum)).ok, true);
	assert.equal((await check(isForum, messageUpdate())).ok, false);
});

test("chatId / fromUser match ids and @usernames, on message and non-message updates", async () => {
	const named = msg({
		chat: { id: 5, type: "supergroup", title: "t", username: "MyChat" },
		from: { id: 7, is_bot: false, first_name: "u", username: "Some_User" },
	});

	assert.equal((await check(chatId(5), named)).ok, true);
	assert.equal((await check(chatId("@mychat"), named)).ok, true);
	assert.equal((await check(chatId("mychat"), named)).ok, true);
	assert.equal((await check(chatId(6, "@other"), named)).ok, false);

	assert.equal((await check(fromUser(7), named)).ok, true);
	assert.equal((await check(fromUser("@some_user"), named)).ok, true);
	assert.equal((await check(fromUser(8), named)).ok, false);

	// widened ctx.from / ctx.chat: inline queries and member updates count
	assert.equal((await check(fromUser(7), inlineQueryUpdate({ fromId: 7 }))).ok, true);
	assert.equal((await check(chatId(5), myChatMemberUpdate({ chatId: 5 }))).ok, true);
});

test("fromBot / isPremium", async () => {
	const bot = msg({ from: { id: 2, is_bot: true, first_name: "b" } });
	const premium = msg({ from: { id: 3, is_bot: false, first_name: "p", is_premium: true } });

	assert.equal((await check(fromBot, bot)).ok, true);
	assert.equal((await check(fromBot, premium)).ok, false);
	assert.equal((await check(isPremium, premium)).ok, true);
	assert.equal((await check(isPremium, bot)).ok, false);
});

// ── message shape ────────────────────────────────────────────────────────────

test("media covers every kind, including paid media and stories", async () => {
	assert.equal((await check(media, msg({ photo: photoSize }))).ok, true);
	assert.equal(
		(await check(media, msg({ paid_media: { star_count: 1, paid_media: [] } } as never))).ok,
		true,
	);
	assert.equal(
		(await check(media, msg({ story: { chat: { id: 1, type: "private" }, id: 1 } } as never))).ok,
		true,
	);
	assert.equal((await check(media, messageUpdate({ text: "no media" }))).ok, false);
});

test("mediaType is an OR across kinds; shorthands narrow", async () => {
	const pv = mediaType("photo", "video");

	assert.equal((await check(pv, msg({ photo: photoSize }))).ok, true);
	assert.equal((await check(pv, msg({ video: { file_id: "v" } } as never))).ok, true);
	assert.equal((await check(pv, msg({ voice: { file_id: "v" } } as never))).ok, false);
	assert.equal((await check(photo, msg({ photo: photoSize }))).ok, true);
});

test("reply / forward / forwardOrigin / viaBot", async () => {
	const replied = msg({ reply_to_message: { message_id: 9 } as Message });
	assert.equal((await check(reply, replied)).ok, true);
	assert.equal((await check(reply, messageUpdate())).ok, false);

	const forwarded = msg({
		forward_origin: { type: "channel", chat: { id: 1, type: "channel" }, date: 0 } as never,
	});
	assert.equal((await check(forward, forwarded)).ok, true);
	assert.equal((await check(forwardOrigin("channel"), forwarded)).ok, true);
	assert.equal((await check(forwardOrigin("user", "hidden_user"), forwarded)).ok, false);

	const viaBotMsg = msg({
		text: "inline result",
		via_bot: { id: 99, is_bot: true, first_name: "g", username: "gif_bot" },
	});
	assert.equal((await check(viaBot(), viaBotMsg)).ok, true);
	assert.equal((await check(viaBot(99), viaBotMsg)).ok, true);
	assert.equal((await check(viaBot("@gif_bot"), viaBotMsg)).ok, true);
	assert.equal((await check(viaBot(1), viaBotMsg)).ok, false);
	assert.equal((await check(viaBot(), messageUpdate())).ok, false);
});

test("hasEntity: text entities, caption entities, staged matching subset", async () => {
	const withText = msg({
		text: "#tag and @mention",
		entities: [
			{ type: "hashtag", offset: 0, length: 4 },
			{ type: "mention", offset: 9, length: 8 },
		],
	});
	const tagged = await check(hasEntity("hashtag"), withText);
	assert.equal(tagged.ok, true);
	assert.deepEqual(tagged.bag.entities, [{ type: "hashtag", offset: 0, length: 4 }]);

	const anyEntity = await check(hasEntity(), withText);
	assert.equal(anyEntity.ok, true);
	assert.equal((anyEntity.bag.entities as MessageEntity[]).length, 2);

	// a #hashtag in a photo caption counts too
	const withCaption = msg({
		caption: "#tag",
		photo: photoSize,
		caption_entities: [{ type: "hashtag", offset: 0, length: 4 }],
	});
	assert.equal((await check(hasEntity("hashtag"), withCaption)).ok, true);

	assert.equal((await check(hasEntity("url"), withText)).ok, false);
	assert.equal((await check(hasEntity(), messageUpdate({ text: "plain" }))).ok, false);
});

test("service messages", async () => {
	const joined = msg({ new_chat_members: [{ id: 5, is_bot: false, first_name: "n" }] });

	assert.equal((await check(service, joined)).ok, true);
	assert.equal((await check(filters.newChatMembers, joined)).ok, true);
	assert.equal((await check(service, messageUpdate({ text: "hi" }))).ok, false);

	const pinned = msg({ pinned_message: { message_id: 3 } as never });
	assert.equal((await check(filters.pinnedMessage, pinned)).ok, true);
});

// ── other updates ────────────────────────────────────────────────────────────

test("callbackData: exact string and regex with staged match", async () => {
	assert.equal((await check(callbackData("menu"), callbackUpdate({ data: "menu" }))).ok, true);
	assert.equal((await check(callbackData("menu"), callbackUpdate({ data: "other" }))).ok, false);
	assert.equal((await check(callbackData("menu"), messageUpdate({ text: "menu" }))).ok, false);

	const paged = await check(callbackData(/^page:(\d+)$/), callbackUpdate({ data: "page:3" }));
	assert.equal(paged.ok, true);
	assert.equal((paged.bag.match as RegExpMatchArray)[1], "3");
});

test("inlineQuery: stages the query; optional string/regex trigger", async () => {
	const any = await check(inlineQuery(), inlineQueryUpdate({ query: "cats" }));
	assert.equal(any.ok, true);
	assert.equal((any.bag.inlineQuery as { query: string }).query, "cats");

	assert.equal((await check(inlineQuery("cats"), inlineQueryUpdate({ query: "cats" }))).ok, true);
	assert.equal((await check(inlineQuery("dogs"), inlineQueryUpdate({ query: "cats" }))).ok, false);

	const matched = await check(inlineQuery(/^gif (.+)/), inlineQueryUpdate({ query: "gif cat" }));
	assert.equal(matched.ok, true);
	assert.equal((matched.bag.match as RegExpMatchArray)[1], "cat");

	assert.equal((await check(inlineQuery(), messageUpdate())).ok, false);
});

test("edited", async () => {
	assert.equal((await check(edited, editedMessageUpdate({ text: "fix" }))).ok, true);
	assert.equal((await check(edited, messageUpdate({ text: "new" }))).ok, false);
});

test("chatMemberStatus: old/new constraints over chat_member and my_chat_member", async () => {
	const joined = chatMemberUpdate({ oldStatus: "left", newStatus: "member" });

	const hit = await check(
		chatMemberStatus({ from: "left", to: ["member", "administrator"] }),
		joined,
	);
	assert.equal(hit.ok, true);
	assert.equal(
		(hit.bag.chatMember as { new_chat_member: { status: string } }).new_chat_member.status,
		"member",
	);

	assert.equal((await check(chatMemberStatus({ to: "kicked" }), joined)).ok, false);
	assert.equal((await check(chatMemberStatus({ from: "member" }), joined)).ok, false);
	assert.equal((await check(chatMemberStatus(), joined)).ok, true);

	const blocked = myChatMemberUpdate({ oldStatus: "member", newStatus: "kicked" });
	assert.equal((await check(chatMemberStatus({ to: "kicked" }), blocked)).ok, true);

	assert.equal((await check(chatMemberStatus(), messageUpdate())).ok, false);
});

// ── compile-time contracts ───────────────────────────────────────────────────
// these functions are never called — they exist so `tsc` proves the type flow.

function _typeContracts(): void {
	// and(): additions intersect, way past mtcute's 6-filter typing ceiling
	new Composer<Context>().filter(
		and(
			regex(/a/),
			regex(/b/),
			regex(/c/),
			regex(/d/),
			regex(/e/),
			regex(/f/),
			regex(/g/),
			command("x"),
		),
		(ctx) => {
			const m: RegExpMatchArray = ctx.match;
			const c: string = ctx.command;
			const a: string[] = ctx.args;
			const p: string = ctx.payload;
			void [m, c, a, p];
		},
	);

	// or(): identical additions unify and stay typed
	new Composer<Context>().filter(or(regex(/a/), regex(/b/)), (ctx) => {
		const m: RegExpMatchArray = ctx.match;
		void m;
	});

	// bare predicates join combinators without eating their neighbors' additions
	new Composer<Context>().filter(
		and(regex(/x/), (ctx: Context) => ctx.updateType === "message"),
		(ctx) => {
			const m: RegExpMatchArray = ctx.match;
			void m;
		},
	);

	// narrowing: chatType pins chat.type, media shorthands make the payload non-optional
	new Composer<Context>().filter(isPrivate, (ctx) => {
		const t: "private" = ctx.chat.type;
		void t;
	});
	new Composer<Context>().filter(photo, (ctx) => {
		const sizes: NonNullable<Message["photo"]> = ctx.message.photo;
		void sizes;
	});
	new Composer<Context>().filter(hasEntity("hashtag"), (ctx) => {
		const entities: MessageEntity[] = ctx.entities;
		void entities;
	});

	// typo'd literals do not compile
	// @ts-expect-error "privat" is not a chat type
	chatType("privat");
	// @ts-expect-error "vide" is not a media kind
	mediaType("vide");
	// @ts-expect-error "hashtagg" is not an entity type
	hasEntity("hashtagg");

	// a filter requiring an enriched context cannot run on a bare composer…
	const needsTag = defineFilter<{ doubled: number }, Context & { tag: number }>((ctx, bag) => {
		bag.doubled = ctx.tag * 2;
		return true;
	});
	// @ts-expect-error the composer's context has no `tag`
	new Composer<Context>().filter(needsTag, () => {});
	// …but composes fine once the context provides what it needs
	new Composer<Context & { tag: number }>().filter(needsTag, (ctx) => {
		const d: number = ctx.doubled;
		void d;
	});
}
