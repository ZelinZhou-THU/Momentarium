package services.users.utils

class ProfileRulesSpec extends munit.FunSuite:
  test("显示名：去首尾空白后 1–32 个字（按码点计）") {
    assertEquals(ProfileRules.normalizeDisplayName("  林间  "), Right("林间"))
    assert(ProfileRules.normalizeDisplayName("   ").isLeft)
    assert(ProfileRules.normalizeDisplayName("字" * 33).isLeft)
    assertEquals(ProfileRules.normalizeDisplayName("字" * 32), Right("字" * 32))
    assertEquals(ProfileRules.normalizeDisplayName("🙂" * 32), Right("🙂" * 32))
  }

  test("简介：去首尾空白后最多 200 个字，可为空") {
    assertEquals(ProfileRules.normalizeBio("  "), Right(""))
    assertEquals(ProfileRules.normalizeBio(" 喜欢拍雨天 "), Right("喜欢拍雨天"))
    assert(ProfileRules.normalizeBio("字" * 201).isLeft)
  }

  test("密码：8–72 个字符") {
    assert(PasswordPolicy.isAcceptable("12345678"))
    assert(!PasswordPolicy.isAcceptable("1234567"))
    assert(!PasswordPolicy.isAcceptable("x" * 73))
  }
