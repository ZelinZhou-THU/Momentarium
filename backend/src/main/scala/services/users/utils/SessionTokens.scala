package services.users.utils

import java.security.{MessageDigest, SecureRandom}
import java.time.Instant
import java.util.Base64

import cats.effect.IO
import scala.concurrent.duration.*

/** 会话令牌：32 字节随机、数据库只存 SHA-256、30 天有效。 */
private[users] object SessionTokens:
  private val TokenByteCount = 32
  private val SessionLifetime = 30.days
  private val secureRandom = new SecureRandom()
  private val tokenEncoder = Base64.getUrlEncoder.withoutPadding()

  def generate: IO[String] = IO.blocking {
    val bytes = new Array[Byte](TokenByteCount)
    secureRandom.nextBytes(bytes)
    tokenEncoder.encodeToString(bytes)
  }

  def hash(rawToken: String): String =
    MessageDigest
      .getInstance("SHA-256")
      .digest(rawToken.getBytes("UTF-8"))
      .map(byte => f"${byte & 0xff}%02x")
      .mkString

  def expiresAt(createdAt: Instant): Instant =
    createdAt.plusMillis(SessionLifetime.toMillis)
