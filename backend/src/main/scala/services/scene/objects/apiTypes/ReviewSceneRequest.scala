package services.scene.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.scene.objects.SceneRunId

/**
 * reviewscene 请求体（api-contract §4.1）：截图必须是 4 张 JPEG data URL，runtime 是沙箱回传的运行时证据。
 * 截图与运行时字段都是不可信输入：格式问题按硬门禁失败处理（不返回 400），服务端只信渲染证据。
 */
final case class ReviewSceneRequest(
  runId: SceneRunId,
  captures: List[String],
  runtime: RuntimeEvidence
)

object ReviewSceneRequest:
  given Encoder[ReviewSceneRequest] = deriveEncoder[ReviewSceneRequest]
  given Decoder[ReviewSceneRequest] = deriveDecoder[ReviewSceneRequest]
