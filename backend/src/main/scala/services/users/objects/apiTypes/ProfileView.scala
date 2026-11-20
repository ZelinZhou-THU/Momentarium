package services.users.objects.apiTypes

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 当前用户的账户与公开资料（api-contract §1.1）。 */
final case class ProfileView(username: String, displayName: String, bio: String, homepagePublic: Boolean, createdAt: Instant)

object ProfileView:
  given Encoder[ProfileView] = deriveEncoder[ProfileView]
  given Decoder[ProfileView] = deriveDecoder[ProfileView]
