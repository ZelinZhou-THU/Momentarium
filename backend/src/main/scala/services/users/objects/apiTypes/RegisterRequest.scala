package services.users.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 注册请求体。 */
final case class RegisterRequest(username: String, password: String)

object RegisterRequest:
  given Encoder[RegisterRequest] = deriveEncoder[RegisterRequest]
  given Decoder[RegisterRequest] = deriveDecoder[RegisterRequest]
