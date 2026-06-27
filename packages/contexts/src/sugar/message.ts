import { MessageContextBase } from "../generated/message.js";
import { MessageSugar } from "./message-mixin.js";

export type { ReactionInput } from "./message-mixin.js";

/** MessageContext = generated base + the shared Message sugar (positional overloads + getters). */
export class MessageContext extends MessageSugar(MessageContextBase) {}
