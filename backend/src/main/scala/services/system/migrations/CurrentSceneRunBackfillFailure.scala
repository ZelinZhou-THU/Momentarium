package services.system.migrations

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId

/** 单个展览指针回填失败：只记录展览 id 与原因摘要，不中断整批迁移（可失败后重跑）。 */
final case class CurrentSceneRunBackfillFailure(exhibitionId: ExhibitionId, reason: String)

object CurrentSceneRunBackfillFailure:
  given Encoder[CurrentSceneRunBackfillFailure] = deriveEncoder[CurrentSceneRunBackfillFailure]
  given Decoder[CurrentSceneRunBackfillFailure] = deriveDecoder[CurrentSceneRunBackfillFailure]
