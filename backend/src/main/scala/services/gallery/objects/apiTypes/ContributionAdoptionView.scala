package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.{ContributionId, PhotoId, PhotoMemoryId}

/** 已采用结果：同一投稿重复采用同一版本幂等返回同一条（目标锁定，photoId 即采用目标）。 */
final case class ContributionAdoptionView(
  contributionId: ContributionId,
  photoId: PhotoId,
  memoryId: PhotoMemoryId,
  adoptedVersion: Int
)

object ContributionAdoptionView:
  given Encoder[ContributionAdoptionView] = deriveEncoder[ContributionAdoptionView]
  given Decoder[ContributionAdoptionView] = deriveDecoder[ContributionAdoptionView]
