package services.users.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** updatemyprofile 请求：整体替换公开资料。 */
final case class UpdateMyProfileRequest(displayName: String, bio: String, homepagePublic: Boolean)

object UpdateMyProfileRequest:
  given Encoder[UpdateMyProfileRequest] = deriveEncoder[UpdateMyProfileRequest]
  given Decoder[UpdateMyProfileRequest] = deriveDecoder[UpdateMyProfileRequest]
