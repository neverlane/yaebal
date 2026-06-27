import { ChatJoinRequestContextBase } from "../generated/chat-join-request.js";

/** ChatJoinRequestContext = generated base + `approve()` / `decline()` shortcuts. */
export class ChatJoinRequestContext extends ChatJoinRequestContextBase {
	/** Approve this chat join request. */
	approve(): Promise<boolean> {
		return this.approveChatJoinRequest();
	}
	/** Decline this chat join request. */
	decline(): Promise<boolean> {
		return this.declineChatJoinRequest();
	}
}
