package services.scene.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.scene.objects.SceneRunId

/** getscenerunbyid 请求：读取某一次运行的完整视图（含代码），供版本预览。 */
final case class GetSceneRunByIdRequest(runId: SceneRunId)

object GetSceneRunByIdRequest:
  given Encoder[GetSceneRunByIdRequest] = deriveEncoder[GetSceneRunByIdRequest]
  given Decoder[GetSceneRunByIdRequest] = deriveDecoder[GetSceneRunByIdRequest]
