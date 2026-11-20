package services.curation.objects

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/**
 * 单张照片的情绪与记忆解读（spec 10.1）：只描述画面与感受，不虚构画面外内容。
 * 由 VisionModel 产出并写入 curation.photo_analyses 缓存。
 */
final case class PhotoAnalysis(
  description: String,
  mood: String,
  palette: List[String],
  memoryCues: List[String],
  sensory: String,
  suggestedCaption: String
)

object PhotoAnalysis:
  given Encoder[PhotoAnalysis] = deriveEncoder[PhotoAnalysis]
  given Decoder[PhotoAnalysis] = deriveDecoder[PhotoAnalysis]
