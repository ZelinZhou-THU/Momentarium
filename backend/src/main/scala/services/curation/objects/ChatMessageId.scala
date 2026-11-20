package services.curation.objects

import java.util.UUID

import io.circe.{Decoder, Encoder}
import scala.util.Try

/** 策展对话消息标识，序列化为 UUID 字符串（curation.chat_messages.id）。 */
final case class ChatMessageId(value: UUID)

object ChatMessageId:
  given Encoder[ChatMessageId] = Encoder.encodeString.contramap(_.value.toString)

  given Decoder[ChatMessageId] = Decoder.decodeString.emap { raw =>
    Try(UUID.fromString(raw)).toEither.left.map(_ => s"非法的消息 ID: $raw").map(ChatMessageId.apply)
  }
