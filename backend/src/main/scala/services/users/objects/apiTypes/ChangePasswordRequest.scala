package services.users.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** changepassword 请求：必须提供当前密码。 */
final case class ChangePasswordRequest(currentPassword: String, newPassword: String)

object ChangePasswordRequest:
  given Encoder[ChangePasswordRequest] = deriveEncoder[ChangePasswordRequest]
  given Decoder[ChangePasswordRequest] = deriveDecoder[ChangePasswordRequest]
