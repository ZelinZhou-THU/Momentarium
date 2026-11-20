package services.gallery.utils

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.apiTypes.PublicAuthorView
import services.users.objects.UserId
import services.users.tables.{ProfileTable, UserTable}

/** 公开场景下的作者身份：只有作者主动开启主页时才对外暴露（读 users 服务的公开表方法）。 */
private[gallery] object PublicAuthors:
  def find(connection: Connection, ownerId: UserId): IO[Option[PublicAuthorView]] =
    for
      user <- UserTable.findById(connection, ownerId)
      profile <- ProfileTable.findByUserId(connection, ownerId)
    yield for
      found <- user
      visible <- profile.filter(_.homepagePublic)
    yield PublicAuthorView(found.username, visible.displayName)
