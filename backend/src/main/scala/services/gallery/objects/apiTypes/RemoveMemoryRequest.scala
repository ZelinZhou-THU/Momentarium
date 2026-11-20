package services.gallery.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.{PhotoId, PhotoMemoryId}

/** removememory：创建者移除照片上的一条已采用讲述（不删照片，释放采用目标锁）。 */
final case class RemoveMemoryRequest(photoId: PhotoId, memoryId: PhotoMemoryId)

object RemoveMemoryRequest:
  given Encoder[RemoveMemoryRequest] = deriveEncoder[RemoveMemoryRequest]
  given Decoder[RemoveMemoryRequest] = deriveDecoder[RemoveMemoryRequest]
