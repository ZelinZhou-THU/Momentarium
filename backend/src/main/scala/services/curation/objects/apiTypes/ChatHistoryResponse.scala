package services.curation.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** getchathistory 的响应：按时间正序的对话消息。 */
final case class ChatHistoryResponse(messages: List[ChatMessageView])

object ChatHistoryResponse:
  given Encoder[ChatHistoryResponse] = deriveEncoder[ChatHistoryResponse]
  given Decoder[ChatHistoryResponse] = deriveDecoder[ChatHistoryResponse]
