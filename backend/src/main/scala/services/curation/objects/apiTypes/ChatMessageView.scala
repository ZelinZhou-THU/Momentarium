package services.curation.objects.apiTypes

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.curation.objects.ChatRole

/** 前端可见的一条对话消息（不带内部 session/id）。 */
final case class ChatMessageView(role: ChatRole, content: String, createdAt: Instant)

object ChatMessageView:
  given Encoder[ChatMessageView] = deriveEncoder[ChatMessageView]
  given Decoder[ChatMessageView] = deriveDecoder[ChatMessageView]
