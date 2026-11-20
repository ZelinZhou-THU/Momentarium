package services.users.utils

import cats.effect.IO

import services.system.api.{ApiError, ApiException, ValidationReason}

/** 密码规则（注册与修改密码共用）：8–72 个字符（72 是 BCrypt 的输入上限）。 */
private[users] object PasswordPolicy:
  private val MinLength = 8
  private val MaxLength = 72

  def isAcceptable(password: String): Boolean =
    password.length >= MinLength && password.length <= MaxLength

  def validate(password: String): IO[Unit] =
    IO.raiseUnless(isAcceptable(password))(
      ApiException(ApiError.validation(ValidationReason.PasswordWeak, s"密码需为 $MinLength–$MaxLength 个字符"))
    )
