import { ChannelPostContextBase } from "../generated/channel-post.js";
import { MessageSugar } from "./message-mixin.js";

/** ChannelPostContext = generated base + the shared Message sugar. */
export class ChannelPostContext extends MessageSugar(ChannelPostContextBase) {}
