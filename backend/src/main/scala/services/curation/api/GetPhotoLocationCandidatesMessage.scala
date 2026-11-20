package services.curation.api

import java.sql.Connection

import cats.effect.IO
import cats.syntax.all.*

import services.curation.objects.apiTypes.PhotoLocationCandidatesResponse
import services.curation.tables.PhotoLocationCandidateTable
import services.curation.utils.LocationCandidateViews
import services.gallery.objects.PhotoId
import services.gallery.tables.{ExhibitionPhotoTable, ExhibitionTable}
import services.system.api.{APIWithTokenMessage, ApiError, ApiException}
import services.users.objects.UserId

/** getphotolocationcandidates（v1.13）：作者只读当前 AI 地点候选，不触发模型调用；无候选返回空数组、model/generatedAt=null。 */
final case class GetPhotoLocationCandidatesMessage(userId: UserId, photoId: PhotoId)
    extends APIWithTokenMessage[PhotoLocationCandidatesResponse]:
  override def plan(connection: Connection): IO[PhotoLocationCandidatesResponse] =
    for
      photo <- ExhibitionPhotoTable.findById(connection, photoId).flatMap {
                 case Some(found) => IO.pure(found)
                 case None => IO.raiseError(GetPhotoLocationCandidatesMessage.notFound)
               }
      _ <- ExhibitionTable.requireOwned(connection, photo.exhibitionId, userId).adaptError {
             case _: ApiException => GetPhotoLocationCandidatesMessage.notFound
           }
      _ <- IO.raiseWhen(photo.archivedAt.isDefined)(GetPhotoLocationCandidatesMessage.notFound)
      candidates <- PhotoLocationCandidateTable.listByPhotoId(connection, photoId)
    yield LocationCandidateViews.response(photoId, candidates)

object GetPhotoLocationCandidatesMessage:
  private val notFound = ApiException(ApiError.notFound("照片不存在"))
