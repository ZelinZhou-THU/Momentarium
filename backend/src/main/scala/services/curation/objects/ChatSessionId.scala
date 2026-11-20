package services.curation.objects

import java.util.UUID

import io.circe.{Decoder, Encoder}
import scala.util.Try

/** 策展对话会话标识，序列化为 UUID 字符串（curation.chat_sessions.id）。 */
final case class ChatSessionId(value: UUID)

object ChatSessionId:
  given Encoder[ChatSessionId] = Encoder.encodeString.contramap(_.value.toString)

  given Decoder[ChatSessionId] = Decoder.decodeString.emap { raw =>
    Try(UUID.fromString(raw)).toEither.left.map(_ => s"非法的会话 ID: $raw").map(ChatSessionId.apply)
  }
