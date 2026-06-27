import { BusinessMessageContextBase } from "../generated/business-message.js";
import { MessageSugar } from "./message-mixin.js";

/** BusinessMessageContext = generated base + the shared Message sugar. */
export class BusinessMessageContext extends MessageSugar(BusinessMessageContextBase) {}
