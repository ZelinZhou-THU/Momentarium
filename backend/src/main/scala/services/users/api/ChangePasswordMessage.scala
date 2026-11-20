package services.users.api

import java.sql.Connection

import cats.effect.IO

import services.system.api.{APIWithTokenMessage, ApiError, ApiException, ValidationReason}
import services.system.db.Transaction
import services.users.objects.UserId
import services.users.objects.apiTypes.{AuthResponse, UserView}
import services.users.tables.{SessionTable, UserTable}
import services.users.utils.{CurrentTime, CurrentUser, PasswordHasher, PasswordPolicy, SessionIssuer}

/**
 * changepassword：校验当前密码与新密码规则，单事务更新哈希、吊销该用户全部会话并签发新令牌。
 * 会话表没有设备信息，因此「其它设备下线」通过吊销全部会话实现，本机用返回的新令牌继续使用。
 * 当前密码错误返回 400 VALIDATION 而非 401：401 在前端代表会话失效，而此时会话本身有效。
 */
final case class ChangePasswordMessage(userId: UserId, currentPassword: String, newPassword: String)
    extends APIWithTokenMessage[AuthResponse]:
  override def plan(connection: Connection): IO[AuthResponse] =
    for
      _ <- PasswordPolicy.validate(newPassword)
      user <- CurrentUser.require(connection, userId)
      matches <- PasswordHasher.matches(currentPassword, user.passwordHash)
      _ <- IO.raiseUnless(matches)(ChangePasswordMessage.incorrect)
      newHash <- PasswordHasher.hash(newPassword)
      now <- CurrentTime.now
      rawToken <- Transaction(connection) {
                    for
                      _ <- UserTable.updatePasswordHash(connection, userId, newHash)
                      _ <- SessionTable.deleteByUserId(connection, userId)
                      token <- SessionIssuer.issue(connection, userId, now)
                    yield token
                  }
    yield AuthResponse(rawToken, UserView(user.id, user.username, user.createdAt))

object ChangePasswordMessage:
  private val incorrect =
    ApiException(ApiError.validation(ValidationReason.PasswordIncorrect, "当前密码不正确"))
