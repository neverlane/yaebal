import { EditedBusinessMessageContextBase } from "../generated/edited-business-message.js";
import { MessageSugar } from "./message-mixin.js";

/** EditedBusinessMessageContext = generated base + the shared Message sugar. */
export class EditedBusinessMessageContext extends MessageSugar(EditedBusinessMessageContextBase) {}
