/**
 * @yaebal/test — an actor-driven test framework for yaebal bots, with zero dependency on any
 * test runner or assertion library. Works with `node:test`, vitest, bun:test, jest, ava —
 * anything that can `await` a promise and call `assert`.
 *
 * {@link createTestEnv} wraps your bot and hands you {@link UserActor}/{@link ChatActor} actors
 * that send it real updates — messages, commands, media, reactions, button clicks, joins,
 * payments — the way real Telegram users would. every outgoing api call is intercepted and
 * recorded (no real HTTP), with sensible auto-stubs, `onApi`/`apiError` overrides for the rest,
 * a virtual clock for TTL/retry tests, and satellite-plugin test packs.
 *
 * fixture builders ({@link messageUpdate} & co.), {@link webhookRequest}/{@link collectUpdates},
 * and {@link withFetch} remain as the escape hatch beneath the actor api — reach for them when
 * you need a raw update shape or full control.
 */

export { type MockApi, type MockApiOptions, mockApi } from "./api.js";
export {
	type ApiErrorSentinel,
	apiError,
	type BotMessage,
	ChatActor,
	type ChatMembership,
	type ChatType,
	type CreateChatOptions,
	createTestEnv,
	installTestClock,
	isApiErrorSentinel,
	type LastBotMessageQuery,
	type MediaOptions,
	type MessageOptions,
	type MockResult,
	type OnApiOptions,
	type RecordedCall,
	TestApiError,
	type TestClock,
	TestEnv,
	type TestEnvOptions,
	type TestPack,
	UserActor,
	UserInChatScope,
	UserOnMessageScope,
} from "./env.js";
export { withFetch } from "./fetch.js";

export { type FoundButton, findButton } from "./keyboard.js";
export { toPlain } from "./normalize.js";
export {
	type BuildUserOptions,
	buildUser,
	type CallbackUpdateOptions,
	type ChatJoinRequestUpdateOptions,
	type ChatMemberUpdateOptions,
	type ChosenInlineResultUpdateOptions,
	callbackUpdate,
	channelPostUpdate,
	chatJoinRequestUpdate,
	chatMemberUpdate,
	chosenInlineResultUpdate,
	createUpdate,
	detectUpdateType,
	editedChannelPostUpdate,
	editedMessageUpdate,
	type InlineQueryUpdateOptions,
	inlineQueryUpdate,
	type MessageUpdateOptions,
	messageUpdate,
	myChatMemberUpdate,
	type PollAnswerUpdateOptions,
	type PollUpdateOptions,
	type PreCheckoutQueryUpdateOptions,
	pollAnswerUpdate,
	pollUpdate,
	preCheckoutQueryUpdate,
	type ShippingQueryUpdateOptions,
	shippingQueryUpdate,
} from "./updates.js";
export {
	collectUpdates,
	type UpdateCollector,
	type WebhookRequestOptions,
	webhookRequest,
} from "./webhook.js";
