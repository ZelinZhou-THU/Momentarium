package services.curation.utils

import cats.effect.IO
import cats.syntax.all.*

import services.gallery.objects.LocationGranularity
import services.system.ai.objects.LocationCandidateDraft
import services.system.api.{ApiError, ApiException}

/** AI 地点候选校验（阶段 3，photo-location-v1）：模型输出不可信，逐条丢弃非法项，全部非法按 MODEL_FAILURE。
  *
  * 规则（api-contract v1.13）：
  * - 候选最多 5 条（超出取前 5）；name trim 后 1–120 码点；reason trim 后 1–200 码点；
  * - 有坐标时坐标成对、有限、WGS84，且 granularity ∈ area|exact；
  * - 无坐标时 granularity 必须缺失/空/hidden（落库为 null，仅名称候选）；
  * - 模型返回空数组 = 无候选，正常成功；非空但全部非法 = MODEL_FAILURE。
  */
private[curation] object LocationCandidateValidation:
  val MaxCandidates: Int = 5
  val MaxNameCodePoints: Int = 120
  val MaxReasonCodePoints: Int = 200

  final case class ValidCandidate(
    name: String,
    latitude: Option[Double],
    longitude: Option[Double],
    granularity: Option[LocationGranularity],
    reason: String
  )

  def validate(drafts: List[LocationCandidateDraft]): IO[List[ValidCandidate]] =
    val kept = drafts.take(MaxCandidates).flatMap(validateOne)
    if drafts.nonEmpty && kept.isEmpty then
      IO.raiseError(ApiException(ApiError.modelFailure("地点模型输出未通过校验，未能得到有效候选")))
    else IO.pure(kept)

  private def validateOne(draft: LocationCandidateDraft): Option[ValidCandidate] =
    for
      name <- trimmedLength(draft.name, MaxNameCodePoints)
      reason <- trimmedLength(draft.reason, MaxReasonCodePoints)
      result <- classify(draft, name, reason)
    yield result

  /** 无坐标 → 仅名称候选；有坐标 → 必须 area/exact。hidden 与缺失等价。 */
  private def classify(
    draft: LocationCandidateDraft,
    name: String,
    reason: String
  ): Option[ValidCandidate] =
    (draft.latitude, draft.longitude) match
      case (None, None) =>
        val nameOnlyGranularity = draft.granularity.map(_.trim.toLowerCase).filter(_.nonEmpty)
        val allowed = nameOnlyGranularity.forall(value => value == "hidden")
        Option.when(allowed)(ValidCandidate(name, None, None, None, reason))
      case (Some(lat), Some(lon)) if isWgs84(lat, lon) =>
        for
          raw <- draft.granularity.map(_.trim.toLowerCase)
          granularity <- LocationGranularity.fromString(raw).toOption
          _ <- Option.when(granularity == LocationGranularity.Area || granularity == LocationGranularity.Exact)(())
        yield ValidCandidate(name, Some(lat), Some(lon), Some(granularity), reason)
      case _ => None

  private def trimmedLength(raw: String, max: Int): Option[String] =
    val value = raw.trim
    val count = value.codePointCount(0, value.length)
    Option.when(count >= 1 && count <= max)(value)

  private def isWgs84(latitude: Double, longitude: Double): Boolean =
    latitude.isFinite && longitude.isFinite &&
      latitude >= -90.0 && latitude <= 90.0 &&
      longitude >= -180.0 && longitude <= 180.0
