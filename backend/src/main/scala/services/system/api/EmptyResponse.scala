package services.system.api

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 成功但无数据返回的统一响应体，序列化为 {}。 */
final case class EmptyResponse()

object EmptyResponse:
  given Encoder[EmptyResponse] = deriveEncoder[EmptyResponse]
  given Decoder[EmptyResponse] = deriveDecoder[EmptyResponse]
