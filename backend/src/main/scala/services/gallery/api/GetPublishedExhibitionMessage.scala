package services.gallery.api

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.ExhibitionId
import services.gallery.objects.apiTypes.PublicExhibitionView
import services.gallery.tables.{ExhibitionTable, PublicationTable}
import services.gallery.utils.{PublicAuthors, PublicationViews}
import services.system.api.{APIMessage, ApiError, ApiException}

/** 公开读展览（无令牌）：只返回 active 快照内容；无 active → 404，草稿永不可见；作者开启主页时附带作者入口。 */
final case class GetPublishedExhibitionMessage(exhibitionId: ExhibitionId) extends APIMessage[PublicExhibitionView]:
  override def plan(connection: Connection): IO[PublicExhibitionView] =
    PublicationTable.findActive(connection, exhibitionId).flatMap {
      case Some(publication) =>
        for
          exhibition <- ExhibitionTable.findById(connection, exhibitionId)
          author <- exhibition.fold(IO.pure(None))(found => PublicAuthors.find(connection, found.ownerId))
        yield PublicationViews.publicView(publication, author)
      case None => IO.raiseError(GetPublishedExhibitionMessage.notFound)
    }

object GetPublishedExhibitionMessage:
  private val notFound = ApiException(ApiError.notFound("展览尚未发布或不存在"))
