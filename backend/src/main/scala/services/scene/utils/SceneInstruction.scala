package services.scene.utils

/**
 * 场景修订指令的规范化与校验（api-contract v1.14 §4.1 / spec §10.6）：
 * - 去首尾 Unicode 空白后为 1–500 个 Unicode 码点；
 * - 允许中文、换行（U+000A）与制表符（U+0009），拒绝 NUL 等其他控制字符；
 * - 不做妨碍自然表达的字符白名单。
 *
 * 纯函数：不写日志、不回显指令内容（隐私要求：修订指令不写日志明文）。
 */
private[scene] object SceneInstruction:

  /** Left 为面向用户的错误说明；API 统一映射为 400 VALIDATION(SCENE_INSTRUCTION_INVALID)。 */
  def normalize(raw: String): Either[String, String] =
    val trimmed = raw.strip
    val codePoints = trimmed.codePointCount(0, trimmed.length)
    if trimmed.isEmpty then Left("修订指令不能为空")
    else if codePoints > SceneContract.MaxRevisionInstructionCodePoints then
      Left(s"修订指令不能超过 ${SceneContract.MaxRevisionInstructionCodePoints} 个字符")
    else if hasForbiddenControl(trimmed) then Left("修订指令不能包含控制字符（换行与制表符除外）")
    else Right(trimmed)

  /** ISO 控制字符（含 NUL、DEL、C1 控制符）中只保留换行与制表符。 */
  private def hasForbiddenControl(text: String): Boolean =
    text.codePoints().anyMatch(codePoint =>
      Character.isISOControl(codePoint) &&
        codePoint != '\n'.toInt &&
        codePoint != '\t'.toInt
    )
