package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 投稿上传的单文件失败：reason 与照片上传共用 UPLOAD_* 两项。 */
final case class ContributionUploadFailure(fileName: String, reason: services.gallery.objects.UploadFailureReason)

object ContributionUploadFailure:
  given Encoder[ContributionUploadFailure] = deriveEncoder[ContributionUploadFailure]
  given Decoder[ContributionUploadFailure] = deriveDecoder[ContributionUploadFailure]
