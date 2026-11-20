package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.PhotoMemoryId

/** 作者视图中的已采用讲述：含 id 以支持创建者移除。 */
final case class PhotoMemoryView(memoryId: PhotoMemoryId, text: String, contributorName: String)

object PhotoMemoryView:
  given Encoder[PhotoMemoryView] = deriveEncoder[PhotoMemoryView]
  given Decoder[PhotoMemoryView] = deriveDecoder[PhotoMemoryView]
