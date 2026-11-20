package services.gallery.api

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.*
import services.gallery.objects.apiTypes.PhotoLocationView
import services.gallery.tables.{ExhibitionPhotoTable, ExhibitionTable, PhotoLocationTable}
import services.gallery.utils.{CurrentTime, PhotoLocations}
import services.system.api.{APIWithTokenMessage, ApiError, ApiException}
import services.system.db.Transaction
import services.users.objects.UserId

/** 设置/确认照片位置（api-contract §2.2 setphotolocation）：写入即作者确认，只刷新展览 updated_at。 */
final case class SetPhotoLocationMessage(
  userId: UserId,
  photoId: PhotoId,
  name: String,
  latitude: Option[Double],
  longitude: Option[Double],
  granularity: String
) extends APIWithTokenMessage[PhotoLocationView]:
  override def plan(connection: Connection): IO[PhotoLocationView] =
    Transaction(connection) {
      for
        photo <- ExhibitionPhotoTable.findById(connection, photoId).flatMap {
                   case Some(found) => IO.pure(found)
                   case None => IO.raiseError(SetPhotoLocationMessage.notFound)
                 }
        _ <- ExhibitionTable.requireOwned(connection, photo.exhibitionId, userId)
        input <- PhotoLocations.requireInput(name, latitude, longitude, granularity)
        existing <- PhotoLocationTable.findById(connection, photoId)
        now <- CurrentTime.now
        location = PhotoLocation(
                     photoId = photoId,
                     source = sourceOf(existing, input),
                     status = LocationStatus.Confirmed,
                     name = input.name,
                     latitude = input.latitude,
                     longitude = input.longitude,
                     granularity = input.granularity,
                     updatedAt = now
                   )
        _ <- PhotoLocationTable.upsert(connection, location)
        // 位置变化只刷新 updated_at，不递增 curation_version，因此场景不会过期。
        _ <- ExhibitionTable.touchUpdatedAt(connection, photo.exhibitionId, now)
      yield PhotoLocations.view(location)
    }

  private def sourceOf(existing: Option[PhotoLocation], input: PhotoLocations.LocationInput): LocationSource =
    existing match
      case Some(current) if current.status == LocationStatus.Suggested && sameValue(current, input) => current.source
      case _ => LocationSource.Manual

  private def sameValue(current: PhotoLocation, input: PhotoLocations.LocationInput): Boolean =
    current.name == input.name &&
      current.latitude == input.latitude &&
      current.longitude == input.longitude &&
      current.granularity == input.granularity

object SetPhotoLocationMessage:
  private val notFound = ApiException(ApiError.notFound("照片不存在"))
