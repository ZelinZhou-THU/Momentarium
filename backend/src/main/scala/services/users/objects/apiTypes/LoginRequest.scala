package services.users.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 登录请求体。 */
final case class LoginRequest(username: String, password: String)

object LoginRequest:
  given Encoder[LoginRequest] = deriveEncoder[LoginRequest]
  given Decoder[LoginRequest] = deriveDecoder[LoginRequest]
