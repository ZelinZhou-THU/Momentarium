package services.scene.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId

/** generatescene 请求体；hint 是用户氛围提示（≤80 字），仅作题面参考，不改变策展结构。 */
final case class GenerateSceneRequest(exhibitionId: ExhibitionId, hint: Option[String])

object GenerateSceneRequest:
  given Encoder[GenerateSceneRequest] = deriveEncoder[GenerateSceneRequest]
  given Decoder[GenerateSceneRequest] = deriveDecoder[GenerateSceneRequest]
