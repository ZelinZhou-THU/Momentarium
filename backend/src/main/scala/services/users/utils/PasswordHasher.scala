package services.users.utils

import cats.effect.IO
import org.mindrot.jbcrypt.BCrypt

/** 密码哈希：BCrypt 加盐，校验只在服务端进行。 */
private[users] object PasswordHasher:
  def hash(password: String): IO[String] =
    IO.blocking(BCrypt.hashpw(password, BCrypt.gensalt()))

  def matches(password: String, passwordHash: String): IO[Boolean] =
    IO.blocking(BCrypt.checkpw(password, passwordHash))
