package services.users.api

import java.sql.Connection

import cats.effect.IO

import services.system.api.{APIMessage, ApiError, ApiException, ConflictReason, ValidationReason}
import services.system.db.Transaction
import services.users.objects.{User, UserId}
import services.users.objects.apiTypes.{AuthResponse, UserView}
import services.users.tables.UserTable
import services.users.utils.{CurrentTime, PasswordHasher, PasswordPolicy, SessionIssuer}

/** 注册：校验用户名与密码，落库账户并立即签发会话令牌。 */
final case class RegisterMessage(username: String, password: String) extends APIMessage[AuthResponse]:
  override def plan(connection: Connection): IO[AuthResponse] =
    for
      validUsername <- validateUsername
      _ <- PasswordPolicy.validate(password)
      now <- CurrentTime.now
      response <- Transaction(connection) {
        for
          existing <- UserTable.findByUsername(connection, validUsername)
          _ <- existing.fold(IO.unit)(_ => IO.raiseError(usernameTaken))
          passwordHash <- PasswordHasher.hash(password)
          userId <- IO.randomUUID.map(UserId.apply)
          user = User(userId, validUsername, passwordHash, now)
          _ <- UserTable.insert(connection, user)
          rawToken <- SessionIssuer.issue(connection, user.id, now)
        yield AuthResponse(rawToken, UserView(user.id, user.username, user.createdAt))
      }
    yield response

  private def validateUsername: IO[String] =
    val candidate = username.trim
    if candidate.matches("[A-Za-z0-9_]{3,32}") then IO.pure(candidate)
    else IO.raiseError(ApiException(ApiError.validation(ValidationReason.UsernameInvalid, "用户名需为 3–32 位字母、数字或下划线")))

  private val usernameTaken: ApiException =
    ApiException(ApiError.conflict(ConflictReason.UsernameTaken, "用户名已被占用"))
