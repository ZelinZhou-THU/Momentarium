package services.scene.objects

import io.circe.{Decoder, Encoder}

/** 评审结论：只有通过 / 需修订两种（spec 9.5）；isPass 由判定规则算出，不在此建模。 */
enum ReviewVerdict:
  case Pass
  case Revise

object ReviewVerdict:
  def toString(verdict: ReviewVerdict): String =
    verdict match
      case ReviewVerdict.Pass => "pass"
      case ReviewVerdict.Revise => "revise"

  /**
   * 解码容错（2026-10-28 live 实测：模型返回 `verdict="fail"`，契约只接受 pass/revise）：
   * 大小写/空白/连字符规范化后做兼容映射；其他未知值仍报错（严格性保留）。
   * Encoder 不变，对外仍只输出 `pass` / `revise`。
   */
  def fromString(value: String): Either[String, ReviewVerdict] =
    normalize(value) match
      case "pass" | "passed" | "ok" | "approved" =>
        Right(ReviewVerdict.Pass)
      case "revise" | "fail" | "failed" | "rejected" | "needs_revision" | "not_pass" =>
        Right(ReviewVerdict.Revise)
      case other =>
        Left(
          s"不支持的评审结论: $other（只允许 pass / revise；兼容 passed/ok/approved 与 fail/failed/rejected/needs_revision/not_pass）"
        )

  private def normalize(value: String): String =
    value.trim.toLowerCase.replace('-', '_').replaceAll("\\s+", "_")

  given Encoder[ReviewVerdict] = Encoder.encodeString.contramap(toString)
  given Decoder[ReviewVerdict] = Decoder.decodeString.emap(fromString)
