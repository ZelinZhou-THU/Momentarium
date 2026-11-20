package services.scene.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId

/** getscenerun 请求体：按展览取最新一次运行（前端 2s 轮询）。 */
final case class GetSceneRunRequest(exhibitionId: ExhibitionId)

object GetSceneRunRequest:
  given Encoder[GetSceneRunRequest] = deriveEncoder[GetSceneRunRequest]
  given Decoder[GetSceneRunRequest] = deriveDecoder[GetSceneRunRequest]
