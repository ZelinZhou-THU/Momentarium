package services.scene.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.PhotoId

/** 客户端沙箱回传的运行时证据（api-contract §4.1）：评审只看这些渲染证据，不作为安全判据。 */
final case class RuntimeEvidence(
  buildMs: Int,
  fps: Double,
  errors: List[String],
  photoIdsUsed: List[PhotoId],
  networkAttempts: Int
)

object RuntimeEvidence:
  given Encoder[RuntimeEvidence] = deriveEncoder[RuntimeEvidence]
  given Decoder[RuntimeEvidence] = deriveDecoder[RuntimeEvidence]
