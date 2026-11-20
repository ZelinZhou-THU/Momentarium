package services.gallery.api

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.PhotoId
import services.gallery.tables.{ExhibitionPhotoTable, ExhibitionTable}
import services.gallery.utils.{CurrentTime, PhotoRemoval}
import services.system.api.{APIWithTokenMessage, ApiError, ApiException, EmptyResponse}
import services.system.db.Transaction
import services.system.startup.AppRuntime
import services.users.objects.UserId

/** 从草稿删除照片：被 active 发布快照引用时只归档（archived_at）不物理删，公开页仍可读（api-contract §2.2）；
  * v2.7 起物理删除补原图/缩略图/展示文件清理，归档不删文件。 */
final case class DeletePhotoMessage(userId: UserId, photoId: PhotoId) extends APIWithTokenMessage[EmptyResponse]:
  override def plan(connection: Connection): IO[EmptyResponse] =
    for
      dataDirectory <- AppRuntime.config.map(_.dataDir)
      staleFiles <- Transaction(connection) {
                      for
                        now <- CurrentTime.now
                        photo <- ExhibitionPhotoTable
                                   .findById(connection, photoId)
                                   .flatMap(_.fold(IO.raiseError(DeletePhotoMessage.notFound))(IO.pure))
                        _ <- ExhibitionTable.requireOwned(connection, photo.exhibitionId, userId)
                        files <- PhotoRemoval.removeOrArchive(connection, photo, now)
                        _ <- ExhibitionTable.touchDraft(connection, photo.exhibitionId, now)
                      yield files
                    }
      _ <- PhotoRemoval.deleteFiles(dataDirectory, staleFiles)
    yield EmptyResponse()

object DeletePhotoMessage:
  private val notFound = ApiException(ApiError.notFound("照片不存在"))
