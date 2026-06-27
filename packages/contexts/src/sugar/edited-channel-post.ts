import { EditedChannelPostContextBase } from "../generated/edited-channel-post.js";
import { MessageSugar } from "./message-mixin.js";

/** EditedChannelPostContext = generated base + the shared Message sugar. */
export class EditedChannelPostContext extends MessageSugar(EditedChannelPostContextBase) {}
