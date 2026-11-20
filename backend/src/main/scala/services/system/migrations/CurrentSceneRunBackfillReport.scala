package services.system.migrations

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/**
 * 一次性 current_scene_run_id 回填迁移的摘要（写入 DATA_DIR/migrations/backfill-current-scene-run-ids.json）：
 * 只用计数与明确失败项描述处理结果，不含用户内容。迁移专用 DTO，不属于 API 传输类型。
 */
final case class CurrentSceneRunBackfillReport(
  exhibitionsTotal: Int,
  pointersFilled: Int,
  pointersSkippedExisting: Int,
  exhibitionsWithoutSucceededRun: Int,
  failures: List[CurrentSceneRunBackfillFailure]
)

object CurrentSceneRunBackfillReport:
  val empty: CurrentSceneRunBackfillReport =
    CurrentSceneRunBackfillReport(0, 0, 0, 0, Nil)

  given Encoder[CurrentSceneRunBackfillReport] = deriveEncoder[CurrentSceneRunBackfillReport]
  given Decoder[CurrentSceneRunBackfillReport] = deriveDecoder[CurrentSceneRunBackfillReport]
