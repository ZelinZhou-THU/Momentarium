package services.scene.api

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.ExhibitionId
import services.gallery.tables.ExhibitionTable
import services.scene.objects.apiTypes.SceneRunHistoryResponse
import services.scene.tables.SceneRunTable
import services.scene.utils.{SceneRunHistory, SceneState}
import services.system.api.APIWithTokenMessage
import services.users.objects.UserId

/**
 * listsceneruns：作者查看展览的全部场景运行（最新在前，不含代码）；不存在或非本人一律 404。
 * v1.14 起 isCurrent 只比较 gallery.exhibitions.current_scene_run_id 指针；
 * acceptable 为服务端判定的采用资格（修订候选 + 父运行仍为当前 + 素材匹配）。
 */
final case class ListSceneRunsMessage(userId: UserId, exhibitionId: ExhibitionId)
    extends APIWithTokenMessage[SceneRunHistoryResponse]:
  override def plan(connection: Connection): IO[SceneRunHistoryResponse] =
    for
      exhibition <- ExhibitionTable.requireOwned(connection, exhibitionId, userId)
      state <- SceneState.load(connection, exhibition)
      runs <- SceneRunTable.listByExhibition(connection, exhibitionId)
    yield SceneRunHistoryResponse(
      runs.map(run =>
        SceneRunHistory.summary(run, exhibition.currentSceneRunId, state.photoIds, exhibition.curationVersion)
      )
    )
