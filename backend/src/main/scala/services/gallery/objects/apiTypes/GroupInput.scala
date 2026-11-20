package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 策展编排中的一个章节输入：标题、叙事与有序照片。 */
final case class GroupInput(title: String, narrative: String, photos: List[ExhibitionPhotoInput])

object GroupInput:
  given Encoder[GroupInput] = deriveEncoder[GroupInput]
  given Decoder[GroupInput] = deriveDecoder[GroupInput]
