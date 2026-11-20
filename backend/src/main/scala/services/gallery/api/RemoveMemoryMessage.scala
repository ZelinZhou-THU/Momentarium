package services.gallery.api

import java.sql.Connection

import cats.effect.{IO, Ref}
import cats.syntax.all.*

import services.gallery.objects.{PhotoId, PhotoMemoryId}
import services.gallery.tables.{ExhibitionPhotoTable, ExhibitionTable, PhotoMemoryTable}
import services.gallery.utils.{CurrentTime, PhotoRemoval}
import services.system.api.{APIWithTokenMessage, ApiError, ApiException, EmptyResponse}
import services.system.db.Transaction
import services.system.startup.AppRuntime
import services.users.objects.UserId

/** removememory（v2.7）：创建者移除照片上的一条已采用讲述。
  *
  * - 讲述不存在 → 幂等成功；
  * - 照片由投稿采用新建（任意投稿，旧数据按时间戳 fallback）且删除本讲述后已无其他讲述 → 草稿照片移除：
  *   被 active 快照引用则归档，否则物理删除并清理文件/封面；
  * - 照片还有其他讲述（或是关联已有照片）→ 只删本讲述，保留照片；
  * - 任何有效移除都 touchDraft（讲述是场景/策展的 AI 输入，移除后场景过期；v0.15.0 起不再只刷新 updated_at）。
  */
final case class RemoveMemoryMessage(userId: UserId, photoId: PhotoId, memoryId: PhotoMemoryId)
    extends APIWithTokenMessage[EmptyResponse]:
  override def plan(connection: Connection): IO[EmptyResponse] =
    for
      dataDirectory <- AppRuntime.config.map(_.dataDir)
      staleFiles <- IO.ref(List.empty[String])
      _ <- Transaction(connection)(remove(connection, staleFiles))
      files <- staleFiles.get
      _ <- PhotoRemoval.deleteFiles(dataDirectory, files)
    yield EmptyResponse()

  private def remove(connection: Connection, staleFiles: Ref[IO, List[String]]): IO[Unit] =
    PhotoMemoryTable.findById(connection, memoryId).flatMap {
      case None => IO.unit
      case Some(memory) =>
        ExhibitionPhotoTable.findById(connection, memory.photoId).flatMap {
          case None => IO.unit
          case Some(photo) =>
            for
              _ <- ExhibitionTable.requireOwned(connection, photo.exhibitionId, userId).adaptError {
                     case _: ApiException => RemoveMemoryMessage.notFound
                   }
              now <- CurrentTime.now
              _ <- PhotoMemoryTable.delete(connection, photo.id, memory.id)
              remaining <- PhotoMemoryTable.listByPhotoId(connection, photo.id)
              _ <-
                if PhotoRemoval.isAdoptionPhoto(photo, memory) && remaining.isEmpty then
                  PhotoRemoval
                    .removeOrArchive(connection, photo, now)
                    .flatMap(files => staleFiles.set(files) *> ExhibitionTable.touchDraft(connection, photo.exhibitionId, now))
                else ExhibitionTable.touchDraft(connection, photo.exhibitionId, now) // 讲述是 AI 输入（v0.15.0）：移除后场景过期
            yield ()
        }
    }

object RemoveMemoryMessage:
  private val notFound: ApiException = ApiException(ApiError.notFound("照片或讲述不存在"))
