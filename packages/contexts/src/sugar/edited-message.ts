import { EditedMessageContextBase } from "../generated/edited-message.js";
import { MessageSugar } from "./message-mixin.js";

/** EditedMessageContext = generated base + the shared Message sugar. */
export class EditedMessageContext extends MessageSugar(EditedMessageContextBase) {}
