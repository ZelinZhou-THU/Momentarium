package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.{ExhibitionId, LocationGranularity, PhotoId}

/** 作者主页跨展览足迹的一个公开位置（api-contract v1.8 §2.1）：只来自已发布快照冻结的公开位置，
  * granularity 只会是 area/exact；hidden 与 suggested 在发布时已被快照过滤，不会出现在该结构中。 */
final case class AuthorJourneyLocation(
  exhibitionId: ExhibitionId,
  exhibitionTitle: String,
  photoId: PhotoId,
  name: String,
  latitude: Double,
  longitude: Double,
  granularity: LocationGranularity
)

object AuthorJourneyLocation:
  given Encoder[AuthorJourneyLocation] = deriveEncoder[AuthorJourneyLocation]
  given Decoder[AuthorJourneyLocation] = deriveDecoder[AuthorJourneyLocation]
