package services.users.api

import java.sql.Connection

import cats.effect.IO

import services.system.api.{APIWithTokenMessage, ApiError, ApiException, NoRequestMessage}
import services.users.objects.UserId
import services.users.objects.apiTypes.UserView
import services.users.tables.UserTable

/** 读取当前令牌对应的用户视图。 */
final case class GetCurrentUserMessage(userId: UserId)
    extends APIWithTokenMessage[UserView],
      NoRequestMessage[UserView]:
  override def plan(connection: Connection): IO[UserView] =
    UserTable
      .findById(connection, userId)
      .flatMap {
        case Some(user) => IO.pure(UserView(user.id, user.username, user.createdAt))
        case None => IO.raiseError(ApiException(ApiError.unauthorized("用户不存在或登录状态无效")))
      }
