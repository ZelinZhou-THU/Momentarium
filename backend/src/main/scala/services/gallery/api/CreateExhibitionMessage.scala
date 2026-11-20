package services.gallery.api

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.{CoverKind, Exhibition, ExhibitionId}
import services.gallery.objects.apiTypes.CreateExhibitionResponse
import services.gallery.tables.ExhibitionTable
import services.gallery.utils.{CurrentTime, ExhibitionValidation}
import services.system.api.APIWithTokenMessage
import services.users.objects.UserId

/** 创建展览：标题必填，初始为空叙事、0 个章节、auto 封面。 */
final case class CreateExhibitionMessage(userId: UserId, title: String) extends APIWithTokenMessage[CreateExhibitionResponse]:
  override def plan(connection: Connection): IO[CreateExhibitionResponse] =
    for
      validTitle <- ExhibitionValidation.requireTitle(title)
      now <- CurrentTime.now
      exhibitionId <- IO.randomUUID.map(ExhibitionId.apply)
      exhibition = Exhibition(
        id = exhibitionId,
        ownerId = userId,
        title = validTitle,
        narrative = "",
        curationVersion = 0,
        coverKind = CoverKind.Auto,
        coverPhotoId = None,
        coverStorageKey = None,
        coverMime = None,
        coverWidth = None,
        coverHeight = None,
        createdAt = now,
        updatedAt = now
      )
      _ <- ExhibitionTable.insert(connection, exhibition)
    yield CreateExhibitionResponse(exhibitionId)
