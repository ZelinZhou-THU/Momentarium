package services.gallery.api

import java.sql.Connection

import cats.effect.IO
import cats.syntax.all.*

import services.curation.tables.PhotoAnalysisTable
import services.gallery.objects.{ExhibitionGroup, ExhibitionId, ExhibitionPhoto, Publication, PublicationId, PublicationStatus}
import services.gallery.objects.apiTypes.PublishExhibitionResponse
import services.gallery.tables.{
  ExhibitionGroupTable,
  ExhibitionPhotoTable,
  ExhibitionTable,
  PhotoLocationTable,
  PhotoMemoryTable,
  PublicationTable
}
import services.gallery.utils.{
  CurrentSceneRuns,
  CurrentTime,
  ExhibitionValidation,
  ExhibitionViews,
  PostgresErrors,
  PublicationViews
}
import services.scene.objects.SceneRun
import services.system.api.{APIWithTokenMessage, ApiError, ApiException, ConflictReason, ValidationReason}
import services.system.db.Transaction
import services.users.objects.UserId

/** 发布/更新发布：校验草稿与场景，单事务写入新 active 快照并 supersede 旧快照（api-contract §2.3/§5.1）；
  * 照片的 AI 解读与场景主色一并冻结进快照（v0.9.8）。v1.14 起只冻结当前采用场景指针所指运行，
  * 指针为空返回 SCENE_NOT_READY，不自动采用最新成功候选。 */
final case class PublishExhibitionMessage(userId: UserId, exhibitionId: ExhibitionId)
    extends APIWithTokenMessage[PublishExhibitionResponse]:
  override def plan(connection: Connection): IO[PublishExhibitionResponse] =
    Transaction(connection) {
      for
        exhibition <- ExhibitionTable.requireOwned(connection, exhibitionId, userId)
        _ <- ExhibitionValidation.requireTitle(exhibition.title)
        groups <- ExhibitionGroupTable.listByExhibition(connection, exhibitionId)
        photos <- ExhibitionPhotoTable.listByExhibition(connection, exhibitionId)
        _ <- validateDraft(groups, photos)
        currentRun <- CurrentSceneRuns.load(connection, exhibition)
        run <- currentRun.fold[IO[SceneRun]](IO.raiseError(PublishExhibitionMessage.sceneNotReady))(IO.pure)
        _ <- IO.raiseUnless(run.code.exists(_.trim.nonEmpty))(PublishExhibitionMessage.sceneNotReady)
        _ <- IO.raiseWhen(ExhibitionViews.isSceneStale(exhibition, photos, currentRun))(
               PublishExhibitionMessage.sceneStale
             )
        analysisRecords <- PhotoAnalysisTable.findByIds(connection, photos.filter(_.archivedAt.isEmpty).map(_.id))
        analyses = analysisRecords.map(record => record.photoId -> record.analysis).toMap
        locations <- PhotoLocationTable.listByExhibition(connection, exhibitionId)
        memories <- PhotoMemoryTable.listByPhotoIds(connection, photos.map(_.id))
        now <- CurrentTime.now
        version <- PublicationTable.findMaxVersion(connection, exhibitionId).map(_ + 1)
        publicationId <- IO.randomUUID.map(PublicationId.apply)
        publication = Publication(
                        id = publicationId,
                        exhibitionId = exhibitionId,
                        version = version,
                        snapshot =
                          PublicationViews.snapshot(exhibition, groups, photos, run, analyses, locations, memories, version, now),
                        status = PublicationStatus.Active,
                        createdAt = now,
                        supersededAt = None
                      )
        _ <- PublicationTable.supersedeActive(connection, exhibitionId, now)
        _ <- PublicationTable.insert(connection, publication).adaptError {
               case error if PostgresErrors.isUniqueViolation(error) => PublishExhibitionMessage.versionConflict
             }
      yield PublishExhibitionResponse(version, now)
    }

  private def validateDraft(groups: List[ExhibitionGroup], photos: List[ExhibitionPhoto]): IO[Unit] =
    val draftPhotos = photos.filter(_.archivedAt.isEmpty)
    val hasUngroupedPhotos = draftPhotos.exists(_.groupId.isEmpty)
    val hasEmptyGroup = groups.exists(group => !draftPhotos.exists(_.groupId.contains(group.id)))
    for
      _ <- IO.raiseWhen(draftPhotos.size < PublishExhibitionMessage.MinimumPhotoCount)(
             PublishExhibitionMessage.photoCountError
           )
      _ <- IO.raiseWhen(hasUngroupedPhotos)(PublishExhibitionMessage.photoUngroupedError)
      _ <- IO.raiseWhen(hasEmptyGroup)(PublishExhibitionMessage.groupEmptyError)
    yield ()

object PublishExhibitionMessage:
  private val MinimumPhotoCount = 3

  private val photoCountError =
    ApiException(ApiError.validation(ValidationReason.PhotoCount, "展览至少需要 3 张照片"))
  private val photoUngroupedError =
    ApiException(ApiError.validation(ValidationReason.PhotoUngrouped, "存在未分组的照片"))
  private val groupEmptyError =
    ApiException(ApiError.validation(ValidationReason.GroupEmpty, "存在空章节"))
  private val sceneNotReady =
    ApiException(ApiError.validation(ValidationReason.SceneNotReady, "尚无通过评审的场景，请先生成场景"))
  private val sceneStale =
    ApiException(ApiError.validation(ValidationReason.SceneStale, "场景已过期，请重新生成后再发布"))
  private val versionConflict =
    ApiException(ApiError.conflict(ConflictReason.VersionConflict, "发布版本冲突，请重试"))
