package services.curation.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.scene.objects.SceneBrief

/**
 * getphotoinsights 响应：只含当前草稿中已分析的照片（未分析的照片由前端按 getexhibition 的照片列表补齐）；
 * latestBrief 是当前采用场景（current_scene_run_id 指针）的题面，没有当前场景时为 null；
 * 字段名为契约兼容保留，语义不是「最新成功运行」。
 */
final case class PhotoInsightsResponse(analyses: List[PhotoAnalysisView], latestBrief: Option[SceneBrief])

object PhotoInsightsResponse:
  given Encoder[PhotoInsightsResponse] = deriveEncoder[PhotoInsightsResponse]
  given Decoder[PhotoInsightsResponse] = deriveDecoder[PhotoInsightsResponse]
