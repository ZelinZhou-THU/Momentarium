package services.curation.objects

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId
import services.users.objects.UserId

/** curation.chat_sessions 行：某个用户对某个展览的策展对话会话。 */
final case class ChatSession(
  id: ChatSessionId,
  exhibitionId: ExhibitionId,
  userId: UserId,
  createdAt: Instant
)

object ChatSession:
  given Encoder[ChatSession] = deriveEncoder[ChatSession]
  given Decoder[ChatSession] = deriveDecoder[ChatSession]
