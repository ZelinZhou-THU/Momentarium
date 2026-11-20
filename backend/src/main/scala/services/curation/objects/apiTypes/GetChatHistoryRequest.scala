package services.curation.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId

/** getchathistory 请求体：取当前用户在该展览上的对话会话消息。 */
final case class GetChatHistoryRequest(exhibitionId: ExhibitionId)

object GetChatHistoryRequest:
  given Encoder[GetChatHistoryRequest] = deriveEncoder[GetChatHistoryRequest]
  given Decoder[GetChatHistoryRequest] = deriveDecoder[GetChatHistoryRequest]
