package services.gallery.api

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.PhotoId
import services.gallery.tables.{ExhibitionPhotoTable, ExhibitionTable, PhotoLocationTable}
import services.gallery.utils.CurrentTime
import services.system.api.{APIWithTokenMessage, ApiError, ApiException, EmptyResponse}
import services.system.db.Transaction
import services.users.objects.UserId

/** 清除照片位置（api-contract §2.2 clearphotolocation）：删除位置行回到“未知”，无记录时幂等成功。 */
final case class ClearPhotoLocationMessage(userId: UserId, photoId: PhotoId)
    extends APIWithTokenMessage[EmptyResponse]:
  override def plan(connection: Connection): IO[EmptyResponse] =
    Transaction(connection) {
      for
        photo <- ExhibitionPhotoTable.findById(connection, photoId).flatMap {
                   case Some(found) => IO.pure(found)
                   case None => IO.raiseError(ClearPhotoLocationMessage.notFound)
                 }
        _ <- ExhibitionTable.requireOwned(connection, photo.exhibitionId, userId)
        now <- CurrentTime.now
        _ <- PhotoLocationTable.deleteByPhotoId(connection, photoId)
        _ <- ExhibitionTable.touchUpdatedAt(connection, photo.exhibitionId, now)
      yield EmptyResponse()
    }

object ClearPhotoLocationMessage:
  private val notFound = ApiException(ApiError.notFound("照片不存在"))
