import {
  requireArray,
  requireObject,
  requireOneOf,
  requireString,
} from "../../apis/shared/decode";

/** 契约 §3.1 ChatMessageView.role：对话角色（固定集合）。 */
export type ChatMessageRole = "user" | "assistant";

const CHAT_MESSAGE_ROLES: readonly ChatMessageRole[] = ["user", "assistant"];

/** 契约 §3.1 ChatMessageView(role, content, createdAt)。 */
export interface ChatMessageView {
  readonly role: ChatMessageRole;
  readonly content: string;
  readonly createdAt: string;
}

export const parseChatMessageView = (value: unknown, path = "chatMessage"): ChatMessageView => {
  const record = requireObject(value, path);
  return {
    role: requireOneOf(record.role, CHAT_MESSAGE_ROLES, `${path}.role`),
    content: requireString(record.content, `${path}.content`),
    createdAt: requireString(record.createdAt, `${path}.createdAt`),
  };
};

/** 契约 §3.1 ChatHistoryResponse(messages)：getchathistory 的响应。 */
export interface ChatHistoryResponse {
  readonly messages: readonly ChatMessageView[];
}

export const parseChatHistoryResponse = (
  value: unknown,
  path = "chatHistory",
): ChatHistoryResponse => {
  const record = requireObject(value, path);
  return {
    messages: requireArray(record.messages, `${path}.messages`).map((message, index) =>
      parseChatMessageView(message, `${path}.messages[${index}]`),
    ),
  };
};
