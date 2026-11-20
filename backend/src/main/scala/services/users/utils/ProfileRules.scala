package services.users.utils

/** 公开资料的规范化与校验（纯函数）：Left 为给用户看的原因；按 Unicode 码点计字数，与前端 `[...s].length` 一致。 */
private[users] object ProfileRules:
  val MaxDisplayNameLength = 32
  val MaxBioLength = 200

  private def characterCount(text: String): Int = text.codePointCount(0, text.length)

  def normalizeDisplayName(raw: String): Either[String, String] =
    val trimmed = raw.trim
    if trimmed.isEmpty then Left("显示名不能为空")
    else if characterCount(trimmed) > MaxDisplayNameLength then Left(s"显示名最多 $MaxDisplayNameLength 个字")
    else Right(trimmed)

  def normalizeBio(raw: String): Either[String, String] =
    val trimmed = raw.trim
    if characterCount(trimmed) > MaxBioLength then Left(s"简介最多 $MaxBioLength 个字") else Right(trimmed)
