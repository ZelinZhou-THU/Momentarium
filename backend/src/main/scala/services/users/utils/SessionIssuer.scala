package services.users.utils

import java.sql.Connection
import java.time.Instant

import cats.effect.IO

import services.users.objects.{Session, UserId}
import services.users.tables.SessionTable

/** 生成并持久化一次会话，返回给前端的原始令牌（数据库只存哈希）。 */
private[users] object SessionIssuer:
  def issue(connection: Connection, userId: UserId, now: Instant): IO[String] =
    for
      rawToken <- SessionTokens.generate
      session = Session(SessionTokens.hash(rawToken), userId, now, SessionTokens.expiresAt(now))
      _ <- SessionTable.insert(connection, session)
    yield rawToken
