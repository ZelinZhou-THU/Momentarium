package services.users.utils

import java.sql.Connection

import cats.effect.IO

import services.system.api.{ApiError, ApiException}
import services.users.objects.{User, UserId}
import services.users.tables.UserTable

/** 令牌已解析出的用户必须仍存在；不存在按会话无效处理（401）。 */
private[users] object CurrentUser:
  def require(connection: Connection, userId: UserId): IO[User] =
    UserTable.findById(connection, userId).flatMap {
      case Some(user) => IO.pure(user)
      case None => IO.raiseError(ApiException(ApiError.unauthorized("用户不存在或登录状态无效")))
    }
