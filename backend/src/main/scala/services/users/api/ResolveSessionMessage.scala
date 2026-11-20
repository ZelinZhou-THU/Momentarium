package services.users.api

import java.sql.Connection

import cats.effect.IO

import services.system.api.{APIMessage, ApiError, ApiException}
import services.users.objects.apiTypes.SessionView
import services.users.tables.SessionTable
import services.users.utils.{CurrentTime, SessionTokens}

/** 内部消息（不注册路由）：路由器用它把前端令牌解析为可信 userId。 */
final case class ResolveSessionMessage(rawToken: String) extends APIMessage[SessionView]:
  override def plan(connection: Connection): IO[SessionView] =
    val tokenHash = SessionTokens.hash(rawToken)
    for
      now <- CurrentTime.now
      session <- SessionTable.findByTokenHash(connection, tokenHash)
      view <- session match
        case None => IO.raiseError(ResolveSessionMessage.invalidSession)
        case Some(found) if found.expiresAt.isBefore(now) =>
          SessionTable.deleteByTokenHash(connection, tokenHash) *> IO.raiseError(ResolveSessionMessage.invalidSession)
        case Some(found) => IO.pure(SessionView(found.userId))
    yield view

object ResolveSessionMessage:
  private[api] val invalidSession: ApiException =
    ApiException(ApiError.unauthorized("登录状态无效或已过期"))
