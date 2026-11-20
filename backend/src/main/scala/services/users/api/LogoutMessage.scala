package services.users.api

import java.sql.Connection

import cats.effect.IO

import services.system.api.{APIWithTokenMessage, EmptyResponse, NoRequestMessage}
import services.system.db.Transaction
import services.users.objects.UserId
import services.users.tables.SessionTable

/** 登出：删除该用户的全部会话，使当前令牌立即失效。 */
final case class LogoutMessage(userId: UserId)
    extends APIWithTokenMessage[EmptyResponse],
      NoRequestMessage[EmptyResponse]:
  override def plan(connection: Connection): IO[EmptyResponse] =
    Transaction(connection)(SessionTable.deleteByUserId(connection, userId)).as(EmptyResponse())
