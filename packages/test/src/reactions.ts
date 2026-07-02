/**
 * per-message reaction state, so {@link UserActor.react} never needs `oldReaction` spelled out
 * by hand — it's inferred from whatever that user's last `react()` on this message left behind.
 * keyed by the `Message` object's identity (a `WeakMap`, so it costs nothing once a message is
 * no longer referenced) rather than `message_id`, since ids aren't guaranteed unique across chats.
 */
const store = new WeakMap<object, Map<number, string[]>>();

/** the emojis a given user currently has on `message` (per-message, per-user reaction state). */
export function reactionsOf(message: object): Map<number, string[]> {
	let state = store.get(message);
	if (!state) {
		state = new Map();
		store.set(message, state);
	}

	return state;
}
