package services.users.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 注册与登录的成功响应。 */
final case class AuthResponse(token: String, user: UserView)

object AuthResponse:
  given Encoder[AuthResponse] = deriveEncoder[AuthResponse]
  given Decoder[AuthResponse] = deriveDecoder[AuthResponse]
