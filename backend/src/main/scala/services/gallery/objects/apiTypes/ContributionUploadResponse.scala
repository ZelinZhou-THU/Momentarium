package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 投稿上传响应：创建返回 status=draft 的摘要，替换返回保持原状态的摘要；单文件失败只入 failures。 */
final case class ContributionUploadResponse(
  contributions: List[ContributionSummary],
  failures: List[ContributionUploadFailure]
)

object ContributionUploadResponse:
  given Encoder[ContributionUploadResponse] = deriveEncoder[ContributionUploadResponse]
  given Decoder[ContributionUploadResponse] = deriveDecoder[ContributionUploadResponse]
