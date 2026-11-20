package services.gallery.api

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.ExhibitionId
import services.gallery.tables.ExhibitionTable
import services.gallery.utils.{CurrentTime, ExhibitionValidation}
import services.system.api.{APIWithTokenMessage, ApiError, ApiException, EmptyResponse}
import services.users.objects.UserId

/** 修改展览标题与叙事（草稿变更会递增 curation_version）。 */
final case class UpdateExhibitionMetaMessage(
  userId: UserId,
  exhibitionId: ExhibitionId,
  title: String,
  narrative: String
) extends APIWithTokenMessage[EmptyResponse]:
  override def plan(connection: Connection): IO[EmptyResponse] =
    for
      validTitle <- ExhibitionValidation.requireTitle(title)
      now <- CurrentTime.now
      updated <- ExhibitionTable.updateMeta(connection, exhibitionId, userId, validTitle, narrative, now)
      _ <- if updated == 0 then IO.raiseError(UpdateExhibitionMetaMessage.notFound) else IO.unit
    yield EmptyResponse()

object UpdateExhibitionMetaMessage:
  private val notFound = ApiException(ApiError.notFound("展览不存在"))
