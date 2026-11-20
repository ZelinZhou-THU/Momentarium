package services.scene.objects

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 五维评分（spec 9.5，每维 1–5 分）；权重与通过判定属于 scene 的 utils，不在对象里。 */
final case class RubricScores(
  moodMatch: Int,
  photoPresence: Int,
  composition: Int,
  lightingColor: Int,
  completeness: Int
)

object RubricScores:
  given Encoder[RubricScores] = deriveEncoder[RubricScores]
  given Decoder[RubricScores] = deriveDecoder[RubricScores]
