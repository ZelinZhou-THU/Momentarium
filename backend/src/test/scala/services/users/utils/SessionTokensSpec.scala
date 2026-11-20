package services.users.utils

import java.time.Instant

class SessionTokensSpec extends munit.FunSuite:
  test("原始令牌不落库：SHA-256 哈希为 64 位十六进制且确定") {
    val rawToken = "test-token-value"
    val tokenHash = SessionTokens.hash(rawToken)
    assertEquals(tokenHash.length, 64)
    assert(tokenHash.forall(character => "0123456789abcdef".contains(character)))
    assertEquals(SessionTokens.hash(rawToken), tokenHash)
  }

  test("不同令牌产生不同哈希") {
    assertNotEquals(SessionTokens.hash("token-a"), SessionTokens.hash("token-b"))
  }

  test("生成 32 字节随机令牌：两次生成不同且为 URL-safe 字符串") {
    val first = SessionTokens.generate.unsafeRunSync()
    val second = SessionTokens.generate.unsafeRunSync()
    assertNotEquals(first, second)
    assert(first.matches("[A-Za-z0-9_-]+"))
    assert(first.length >= 43)
  }

  test("会话有效期 30 天") {
    val createdAt = Instant.parse("2026-10-27T00:00:00Z")
    assertEquals(SessionTokens.expiresAt(createdAt).toString, "2026-11-26T00:00:00Z")
  }

  private given cats.effect.unsafe.IORuntime = cats.effect.unsafe.IORuntime.global
