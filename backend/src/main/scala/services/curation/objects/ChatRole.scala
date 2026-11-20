package services.curation.objects

import io.circe.{Decoder, Encoder}

/** 对话角色（spec 7 curation.chat_messages.role）：用户或 AI 策展助手。 */
enum ChatRole:
  case User
  case Assistant

object ChatRole:
  def toString(role: ChatRole): String =
    role match
      case ChatRole.User => "user"
      case ChatRole.Assistant => "assistant"

  def fromString(value: String): Either[String, ChatRole] =
    value.trim.toLowerCase match
      case "user" => Right(ChatRole.User)
      case "assistant" => Right(ChatRole.Assistant)
      case other => Left(s"不支持的对话角色: $other")

  given Encoder[ChatRole] = Encoder.encodeString.contramap(role => toString(role))

  given Decoder[ChatRole] = Decoder.decodeString.emap(fromString)
