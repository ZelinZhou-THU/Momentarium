package services.gallery.utils

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.Exhibition
import services.scene.objects.{SceneRun, SceneRunStatus}
import services.scene.tables.SceneRunTable

/**
 * 按 gallery.exhibitions.current_scene_run_id 读取「当前采用场景」（v1.14）。
 *
 * 只调用 scene 的公开 Table 方法/公开类型；指针指向的行必须属于同一展览且为 succeeded，否则视为无效（None）。
 * 正式切换后不做运行期“空指针取最新成功”兜底：旧展览必须由一次性 JVM 迁移回填指针。
 */
private[gallery] object CurrentSceneRuns:
  def load(connection: Connection, exhibition: Exhibition): IO[Option[SceneRun]] =
    exhibition.currentSceneRunId match
      case None => IO.pure(None)
      case Some(runId) =>
        SceneRunTable.findById(connection, runId).map(_.filter(isValid(exhibition, _)))

  private def isValid(exhibition: Exhibition, run: SceneRun): Boolean =
    run.exhibitionId == exhibition.id && run.status == SceneRunStatus.Succeeded
