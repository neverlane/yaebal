import type { EphemeralMessageParameters, Message, ReplyParameters } from "@yaebal/types";

/** defaults shared by generated and positional reply/quote shortcuts. */
export function messageReplyParameters(
	message: Pick<Message, "message_id" | "ephemeral_message_id" | "receiver_user" | "from">,
): {
	reply_parameters: ReplyParameters;
	ephemeral_message_parameters?: EphemeralMessageParameters;
} {
	if (message.ephemeral_message_id === undefined) {
		return { reply_parameters: { message_id: message.message_id } };
	}
	const receiver = message.receiver_user?.id ?? message.from?.id;
	if (receiver === undefined) throw new Error("reply(): no receiver for the ephemeral message");
	return {
		reply_parameters: { ephemeral_message_id: message.ephemeral_message_id },
		ephemeral_message_parameters: { receiver_user_id: receiver },
	};
}
