package services.users.api

import java.sql.Connection

import cats.effect.IO

import services.system.api.{APIMessage, ApiError, ApiException}
import services.system.db.Transaction
import services.users.objects.apiTypes.{AuthResponse, UserView}
import services.users.tables.UserTable
import services.users.utils.{CurrentTime, PasswordHasher, SessionIssuer}

/** 登录：校验密码后签发新会话令牌。 */
final case class LoginMessage(username: String, password: String) extends APIMessage[AuthResponse]:
  override def plan(connection: Connection): IO[AuthResponse] =
    for
      user <- UserTable
                .findByUsername(connection, username.trim)
                .flatMap {
                  case Some(found) => IO.pure(found)
                  case None => IO.raiseError(LoginMessage.loginFailed)
                }
      passwordMatched <- PasswordHasher.matches(password, user.passwordHash)
      _ <- if passwordMatched then IO.unit else IO.raiseError(LoginMessage.loginFailed)
      now <- CurrentTime.now
      rawToken <- Transaction(connection)(SessionIssuer.issue(connection, user.id, now))
    yield AuthResponse(rawToken, UserView(user.id, user.username, user.createdAt))

object LoginMessage:
  private val loginFailed: ApiException =
    ApiException(ApiError.unauthorized("用户名或密码错误"))
