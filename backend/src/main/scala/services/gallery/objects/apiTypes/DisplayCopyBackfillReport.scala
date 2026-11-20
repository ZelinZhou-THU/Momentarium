package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 历史展示副本回填摘要（P0-B2 迁移入口使用，不注册路由）：
  * 照片按“生成/跳过/失败”计数，render 封面按“重编码/跳过/失败”计数，失败列表供重跑定位。
  */
final case class DisplayCopyBackfillReport(
  photosTotal: Int,
  photosGenerated: Int,
  photosSkipped: Int,
  photoFailures: List[DisplayCopyBackfillFailure],
  rendersTotal: Int,
  rendersReencoded: Int,
  rendersSkipped: Int,
  renderFailures: List[DisplayCopyBackfillFailure]
)

object DisplayCopyBackfillReport:
  given Encoder[DisplayCopyBackfillReport] = deriveEncoder[DisplayCopyBackfillReport]
  given Decoder[DisplayCopyBackfillReport] = deriveDecoder[DisplayCopyBackfillReport]
