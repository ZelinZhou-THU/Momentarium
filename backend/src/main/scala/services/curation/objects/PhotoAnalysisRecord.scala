package services.curation.objects

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.PhotoId

/**
 * 照片分析缓存记录：photoId / model / analyzedAt 是缓存元数据，
 * analysis 是模型解读本身；调用方（curation 自身、scene）需要用 photoId 把分析结果与照片对齐。
 */
final case class PhotoAnalysisRecord(
  photoId: PhotoId,
  analysis: PhotoAnalysis,
  model: String,
  analyzedAt: Instant
)

object PhotoAnalysisRecord:
  given Encoder[PhotoAnalysisRecord] = deriveEncoder[PhotoAnalysisRecord]
  given Decoder[PhotoAnalysisRecord] = deriveDecoder[PhotoAnalysisRecord]
