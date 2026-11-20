package services.gallery.api

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.ExhibitionId
import services.gallery.tables.ExhibitionTable
import services.system.api.{APIWithTokenMessage, ApiError, ApiException, EmptyResponse}
import services.users.objects.UserId

/** 删除展览（章节与照片按同 schema 外键级联删除）。 */
final case class DeleteExhibitionMessage(userId: UserId, exhibitionId: ExhibitionId)
    extends APIWithTokenMessage[EmptyResponse]:
  override def plan(connection: Connection): IO[EmptyResponse] =
    ExhibitionTable
      .delete(connection, exhibitionId, userId)
      .flatMap(deleted => if deleted == 0 then IO.raiseError(DeleteExhibitionMessage.notFound) else IO.unit)
      .as(EmptyResponse())

object DeleteExhibitionMessage:
  private val notFound = ApiException(ApiError.notFound("展览不存在"))
