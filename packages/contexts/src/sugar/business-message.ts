import { BusinessMessageContextBase } from "../generated/business-message.js";
import { MessageSugar } from "./message-mixin.js";

/**
 * BusinessMessageContext = generated base + the shared Message sugar.
 * `delete` is overridden because plain deleteMessage does not work in business
 * chats — Telegram only deletes there via deleteBusinessMessages.
 */
export class BusinessMessageContext extends MessageSugar(BusinessMessageContextBase) {
	/** delete this message (routed via deleteBusinessMessages; needs the can_delete_* right). */
	override delete(): Promise<boolean> {
		return this.api.call<boolean>("deleteBusinessMessages", {
			business_connection_id: this.business_connection_id,
			message_ids: [this.message_id],
		});
	}
}
