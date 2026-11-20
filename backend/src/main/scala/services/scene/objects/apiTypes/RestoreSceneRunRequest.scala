package services.scene.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.scene.objects.SceneRunId

/** restorescenerun 请求：把一次成功运行恢复为当前场景。 */
final case class RestoreSceneRunRequest(runId: SceneRunId)

object RestoreSceneRunRequest:
  given Encoder[RestoreSceneRunRequest] = deriveEncoder[RestoreSceneRunRequest]
  given Decoder[RestoreSceneRunRequest] = deriveDecoder[RestoreSceneRunRequest]
