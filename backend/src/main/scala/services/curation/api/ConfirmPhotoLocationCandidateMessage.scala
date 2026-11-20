package services.curation.api

import java.sql.Connection

import cats.effect.IO
import cats.syntax.all.*

import services.curation.objects.LocationCandidateId
import services.curation.tables.PhotoLocationCandidateTable
import services.curation.utils.CurrentTime
import services.gallery.objects.*
import services.gallery.objects.apiTypes.PhotoLocationView
import services.gallery.tables.{ExhibitionPhotoTable, ExhibitionTable, PhotoLocationTable}
import services.system.api.{APIWithTokenMessage, ApiError, ApiException, ValidationReason}
import services.system.db.Transaction
import services.users.objects.UserId

/**
 * confirmphotolocationcandidate（v1.13）：作者把候选的 name/坐标复制到 gallery.photo_locations（source=ai、status=confirmed），
 * 公开粒度使用请求选择值；候选必须属于该照片且仍在当前候选集；候选无坐标时只允许 hidden。
 * 确认只刷新展览 updated_at，不递增 curationVersion、不使场景过期，也不改动候选集。
 */
final case class ConfirmPhotoLocationCandidateMessage(
  userId: UserId,
  photoId: PhotoId,
  candidateId: LocationCandidateId,
  granularity: String
) extends APIWithTokenMessage[PhotoLocationView]:
  override def plan(connection: Connection): IO[PhotoLocationView] =
    Transaction(connection) {
      for
        photo <- ExhibitionPhotoTable.findById(connection, photoId).flatMap {
                   case Some(found) => IO.pure(found)
                   case None => IO.raiseError(ConfirmPhotoLocationCandidateMessage.notFound)
                 }
        _ <- ExhibitionTable.requireOwned(connection, photo.exhibitionId, userId).adaptError {
               case _: ApiException => ConfirmPhotoLocationCandidateMessage.notFound
             }
        candidate <- PhotoLocationCandidateTable.findById(connection, candidateId).flatMap {
                       case Some(found) if found.photoId == photoId => IO.pure(found)
                       case _ => IO.raiseError(ConfirmPhotoLocationCandidateMessage.notFound)
                     }
        publicGranularity <- LocationGranularity.fromString(granularity) match
                               case Right(value) => IO.pure(value)
                               case Left(_) =>
                                 IO.raiseError(
                                   ApiException(
                                     ApiError.validation(
                                       ValidationReason.LocationGranularityInvalid,
                                       "公开粒度必须是 hidden、area 或 exact"
                                     )
                                   )
                                 )
        _ <- IO.raiseWhen(candidate.latitude.isEmpty && publicGranularity != LocationGranularity.Hidden)(
               ApiException(
                 ApiError.validation(
                   ValidationReason.LocationCoordinatesInvalid,
                   "该候选没有坐标，只能选择 hidden（仅名称）"
                 )
               )
             )
        now <- CurrentTime.now
        location = PhotoLocation(
                     photoId = photoId,
                     source = LocationSource.Ai,
                     status = LocationStatus.Confirmed,
                     name = candidate.name,
                     latitude = candidate.latitude,
                     longitude = candidate.longitude,
                     granularity = publicGranularity,
                     updatedAt = now
                   )
        _ <- PhotoLocationTable.upsert(connection, location)
        // 位置变化只刷新 updated_at，不递增 curation_version，因此场景不会过期。
        _ <- ExhibitionTable.touchUpdatedAt(connection, photo.exhibitionId, now)
      yield PhotoLocationView(
        photoId = location.photoId,
        source = location.source,
        status = location.status,
        name = location.name,
        latitude = location.latitude,
        longitude = location.longitude,
        granularity = location.granularity
      )
    }

object ConfirmPhotoLocationCandidateMessage:
  private val notFound = ApiException(ApiError.notFound("照片或地点候选不存在"))
