package services.scene.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.scene.objects.SceneRunId

/** cancelscene 请求体（api-contract §4.1）：按 runId 取消非终态运行，响应仍是 SceneRunView。 */
final case class CancelSceneRequest(runId: SceneRunId)

object CancelSceneRequest:
  given Encoder[CancelSceneRequest] = deriveEncoder[CancelSceneRequest]
  given Decoder[CancelSceneRequest] = deriveDecoder[CancelSceneRequest]
