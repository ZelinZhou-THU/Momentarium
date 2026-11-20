package services.system.ai.objects

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 模型原始地点候选（未校验；模型输出不可信，由 curation 逐条校验后才会落库）。
  *
  * 有坐标的候选 granularity 为 area/exact；只有名称的候选 latitude/longitude/granularity 均为 null。
  * 字段全部宽松接收（granularity 用字符串），非法值由上层逐条丢弃，避免整次响应解码失败。 */
final case class LocationCandidateDraft(
  name: String,
  latitude: Option[Double],
  longitude: Option[Double],
  granularity: Option[String],
  reason: String
)

object LocationCandidateDraft:
  given Encoder[LocationCandidateDraft] = deriveEncoder[LocationCandidateDraft]
  given Decoder[LocationCandidateDraft] = deriveDecoder[LocationCandidateDraft]

/** 模型结构化输出的顶层对象：无法判断时返回空 candidates 数组。 */
final case class LocationCandidateDrafts(candidates: List[LocationCandidateDraft])

object LocationCandidateDrafts:
  given Encoder[LocationCandidateDrafts] = deriveEncoder[LocationCandidateDrafts]
  given Decoder[LocationCandidateDrafts] = deriveDecoder[LocationCandidateDrafts]
