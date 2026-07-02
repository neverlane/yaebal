import assert from "node:assert/strict";
import test from "node:test";
import {
	buildUser,
	callbackUpdate,
	channelPostUpdate,
	chatJoinRequestUpdate,
	chatMemberUpdate,
	chosenInlineResultUpdate,
	createUpdate,
	detectUpdateType,
	editedMessageUpdate,
	inlineQueryUpdate,
	messageUpdate,
	myChatMemberUpdate,
	pollAnswerUpdate,
	pollUpdate,
	preCheckoutQueryUpdate,
	shippingQueryUpdate,
} from "./updates.js";

test("messageUpdate produces a valid message update", () => {
	const update = messageUpdate({ text: "hello", chatId: 42, chatType: "group" });

	assert.ok(update.update_id > 0);
	assert.equal(update.message?.text, "hello");
	assert.equal(update.message?.chat.id, 42);
	assert.equal(update.message?.chat.type, "group");
	assert.equal(update.message?.from?.id, 42);
});

test("callbackUpdate produces a valid callback_query update", () => {
	const update = callbackUpdate({ data: "click", chatId: 7, fromId: 9 });

	assert.equal(update.callback_query?.data, "click");
	assert.equal(update.callback_query?.from.id, 9);
	assert.equal(update.callback_query?.message?.chat.id, 7);
});

test("createUpdate fills a fresh update_id", () => {
	const a = createUpdate();
	const b = createUpdate();

	assert.notEqual(a.update_id, b.update_id);
});

test("buildUser auto-allocates distinct ids and fills defaults", () => {
	const a = buildUser();
	const b = buildUser({ firstName: "Linia", username: "linia" });

	assert.notEqual(a.id, b.id);
	assert.equal(b.first_name, "Linia");
	assert.equal(b.username, "linia");
	assert.equal(b.is_bot, false);
});

test("channelPostUpdate / editedMessageUpdate build the right update key", () => {
	assert.equal(channelPostUpdate({ text: "hi" }).channel_post?.text, "hi");
	assert.equal(channelPostUpdate().channel_post?.chat.type, "channel");
	assert.equal(editedMessageUpdate({ text: "hi" }).edited_message?.text, "hi");
});

test("inlineQueryUpdate / chosenInlineResultUpdate build their payloads", () => {
	const iq = inlineQueryUpdate({ query: "cats", fromId: 5 });
	assert.equal(iq.inline_query?.query, "cats");
	assert.equal(iq.inline_query?.from.id, 5);

	const cir = chosenInlineResultUpdate({ resultId: "r1", query: "cats" });
	assert.equal(cir.chosen_inline_result?.result_id, "r1");
});

test("shippingQueryUpdate / preCheckoutQueryUpdate build valid payloads", () => {
	const sq = shippingQueryUpdate({ shippingAddress: { city: "Berlin" } });
	assert.equal(sq.shipping_query?.shipping_address.city, "Berlin");

	const pcq = preCheckoutQueryUpdate({ currency: "EUR", totalAmount: 500 });
	assert.equal(pcq.pre_checkout_query?.currency, "EUR");
	assert.equal(pcq.pre_checkout_query?.total_amount, 500);
});

test("pollUpdate / pollAnswerUpdate build valid payloads", () => {
	const poll = pollUpdate({ question: "?", options: ["a", "b", "c"] });
	assert.equal(poll.poll?.options.length, 3);
	assert.equal(poll.poll?.options[1]?.text, "b");

	const answer = pollAnswerUpdate({ optionIds: [1] });
	assert.deepEqual(answer.poll_answer?.option_ids, [1]);
});

test("myChatMemberUpdate / chatMemberUpdate / chatJoinRequestUpdate build valid payloads", () => {
	const my = myChatMemberUpdate({ oldStatus: "left", newStatus: "member" });
	assert.equal(my.my_chat_member?.old_chat_member.status, "left");
	assert.equal(my.my_chat_member?.new_chat_member.status, "member");

	const other = chatMemberUpdate({ userId: 7 });
	assert.equal(other.chat_member?.new_chat_member.user.id, 7);

	const join = chatJoinRequestUpdate({ chatId: 3, fromId: 4, bio: "hi" });
	assert.equal(join.chat_join_request?.chat.id, 3);
	assert.equal(join.chat_join_request?.bio, "hi");
});

test("detectUpdateType infers the payload key", () => {
	assert.equal(detectUpdateType(messageUpdate()), "message");
	assert.equal(detectUpdateType(callbackUpdate()), "callback_query");
	assert.equal(detectUpdateType(pollUpdate()), "poll");
});
