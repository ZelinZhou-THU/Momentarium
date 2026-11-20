package services.gallery.objects

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/**
 * 快照里冻结的单张照片 AI 解读（v0.9.8）：发布时取自照片分析缓存，之后重新分析不影响已发布版本。
 * poeticLine 是视觉模型写的配文（suggestedCaption），sensory 是感官描写，palette 是画面主色（#RRGGBB）。
 */
final case class SnapshotPhotoReading(
  palette: List[String],
  poeticLine: String,
  sensory: String
)

object SnapshotPhotoReading:
  given Encoder[SnapshotPhotoReading] = deriveEncoder[SnapshotPhotoReading]
  given Decoder[SnapshotPhotoReading] = deriveDecoder[SnapshotPhotoReading]
