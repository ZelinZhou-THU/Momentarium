package services.curation.objects

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** curation.chat_messages 行：对话中的一条 user/assistant 文本消息。 */
final case class ChatMessage(
  id: ChatMessageId,
  sessionId: ChatSessionId,
  role: ChatRole,
  content: String,
  createdAt: Instant
)

object ChatMessage:
  given Encoder[ChatMessage] = deriveEncoder[ChatMessage]
  given Decoder[ChatMessage] = deriveDecoder[ChatMessage]
