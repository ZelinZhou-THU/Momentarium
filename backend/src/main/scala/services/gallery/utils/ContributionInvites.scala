package services.gallery.utils

import java.security.{MessageDigest, SecureRandom}
import java.util.Base64

import cats.effect.IO

/** 投稿邀请令牌：32 字节随机（URL-safe base64 无填充），数据库只存 SHA-256；与用户会话令牌同一安全模式。 */
private[gallery] object ContributionInvites:
  private val TokenByteCount = 32
  private val secureRandom = new SecureRandom()
  private val tokenEncoder = Base64.getUrlEncoder.withoutPadding()

  def generateToken: IO[String] = IO.blocking {
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
