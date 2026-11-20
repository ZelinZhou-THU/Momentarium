package services.gallery.api

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.apiTypes.AuthorPageView
import services.gallery.tables.PublicationTable
import services.gallery.utils.PublicationViews
import services.system.api.{APIMessage, ApiError, ApiException}
import services.users.tables.{ProfileTable, UserTable}

/**
 * getauthorpage（公开，无令牌）：作者开启主页时返回其公开资料与全部已发布展览。
 * 用户不存在与主页未开启返回同一个 404，避免借此枚举用户名。
 */
final case class GetAuthorPageMessage(username: String) extends APIMessage[AuthorPageView]:
  override def plan(connection: Connection): IO[AuthorPageView] =
    for
      user <- UserTable.findByUsername(connection, username.trim).flatMap {
                case Some(found) => IO.pure(found)
                case None => IO.raiseError(GetAuthorPageMessage.notFound)
              }
      profile <- ProfileTable.findByUserId(connection, user.id).flatMap {
                   case Some(found) if found.homepagePublic => IO.pure(found)
                   case _ => IO.raiseError(GetAuthorPageMessage.notFound)
                 }
      publications <- PublicationTable.listActiveByOwner(connection, user.id)
    yield AuthorPageView(
      username = user.username,
      displayName = profile.displayName,
      bio = profile.bio,
      exhibitions = publications.map(PublicationViews.authorCard),
      journeyLocations = PublicationViews.journeyLocations(publications)
    )

object GetAuthorPageMessage:
  private val notFound = ApiException(ApiError.notFound("作者主页不存在或未公开"))
