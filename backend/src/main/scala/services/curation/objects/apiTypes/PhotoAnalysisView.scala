package services.curation.objects.apiTypes

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.curation.objects.PhotoAnalysis
import services.gallery.objects.PhotoId

/** 一张照片的 AI 解读（api-contract §3.1）；model/analyzedAt 说明解读来自哪个模型、何时生成。 */
final case class PhotoAnalysisView(photoId: PhotoId, analysis: PhotoAnalysis, model: String, analyzedAt: Instant)

object PhotoAnalysisView:
  given Encoder[PhotoAnalysisView] = deriveEncoder[PhotoAnalysisView]
  given Decoder[PhotoAnalysisView] = deriveDecoder[PhotoAnalysisView]
