package services.scene.objects

import io.circe.{ACursor, Decoder, DecodingFailure, Encoder, Json}
import io.circe.generic.semiauto.deriveEncoder

/**
 * 父智能体（VLM）对场景截图的主观验收结果（spec 9.5）；issues 最多 6 条，由调用方校验。
 *
 * 解码容错（2026-10-28 live 实测）：模型可能把 issues 输出成对象数组（`{"issue","fix"}` 或
 * `{"维度","证据","改法"}`）而不是契约要求的字符串数组；`Decoder` 会把对象数组/混合数组归一化为
 * 字符串（对象内全部字符串值按字段顺序以「｜」连接），scores/verdict/summary 仍严格解码。
 *
 * 2026-11-01 live 实测：模型偶尔漏掉 verdict 或 summary，整次评审因此作废。这两个字段在
 * ReviewDecision.normalize 中都会由服务端按分数重算，缺失时按 revise / 空摘要解码；
 * 出现但类型或取值非法仍报错。scores 与 issues 是评审的实际内容，仍必须出现。
 */
final case class SceneReview(
  scores: RubricScores,
  verdict: ReviewVerdict,
  issues: List[String],
  summary: String
)

object SceneReview:
  given Encoder[SceneReview] = deriveEncoder[SceneReview]

  private val IssueSeparator = "｜"

  given Decoder[SceneReview] = Decoder.instance { cursor =>
    for
      scores <- cursor.get[RubricScores]("scores")
      verdict <- cursor.get[Option[ReviewVerdict]]("verdict")
      rawIssues <- cursor.get[List[Json]]("issues")
      issues <- normalizeIssues(rawIssues, cursor.downField("issues"))
      summary <- cursor.get[Option[String]]("summary")
    yield SceneReview(scores, verdict.getOrElse(ReviewVerdict.Revise), issues, summary.getOrElse(""))
  }

  /** a) 字符串原样保留；b) 对象取全部字符串值按字段顺序以「｜」连接；c) 混合数组逐元素归一化。 */
  private def normalizeIssues(values: List[Json], cursor: ACursor): Either[DecodingFailure, List[String]] =
    values.zipWithIndex
      .foldLeft[Either[DecodingFailure, List[String]]](Right(Nil)) { case (accumulated, (value, index)) =>
        for
          collected <- accumulated
          issue <- issueText(value, cursor.downN(index))
        yield collected :+ issue
      }

  private def issueText(value: Json, cursor: ACursor): Either[DecodingFailure, String] =
    value.asString match
      case Some(text) => Right(text)
      case None =>
        value.asObject match
          case Some(fields) =>
            val parts = fields.toList.flatMap(_._2.asString).map(_.trim).filter(_.nonEmpty)
            if parts.nonEmpty then Right(parts.mkString(IssueSeparator))
            else Left(DecodingFailure("issues 元素对象内没有可用的字符串值", cursor.history))
          case None =>
            Left(DecodingFailure("issues 元素必须是字符串或含字符串值的对象（服务端已做容错归一）", cursor.history))
