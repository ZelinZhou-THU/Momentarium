package services.users.api

import java.sql.Connection

import cats.effect.IO

import services.system.api.{APIWithTokenMessage, NoRequestMessage}
import services.users.objects.UserId
import services.users.objects.apiTypes.ProfileView
import services.users.tables.ProfileTable
import services.users.utils.{CurrentUser, ProfileViews}

/** getmyprofile：读取当前用户的账户与公开资料（无资料行时返回默认值）。 */
final case class GetMyProfileMessage(userId: UserId)
    extends APIWithTokenMessage[ProfileView],
      NoRequestMessage[ProfileView]:
  override def plan(connection: Connection): IO[ProfileView] =
    for
      user <- CurrentUser.require(connection, userId)
      profile <- ProfileTable.findByUserId(connection, userId)
    yield ProfileViews.view(user, profile)
