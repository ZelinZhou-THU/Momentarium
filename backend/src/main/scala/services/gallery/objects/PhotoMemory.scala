package services.gallery.objects

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.users.objects.UserId

/** gallery.photo_memories：照片上已采用的讲述（含采用时冻结的署名与采用版本）。
  * contribution_id 唯一：一条投稿最多对应一个已采用目标，用于采用目标锁定与幂等判断。 */
final case class PhotoMemory(
  id: PhotoMemoryId,
  photoId: PhotoId,
  contributionId: ContributionId,
  contributorUserId: UserId,
  contributorName: String,
  text: String,
  adoptedVersion: Int,
  createdAt: Instant,
  updatedAt: Instant
)

object PhotoMemory:
  given Encoder[PhotoMemory] = deriveEncoder[PhotoMemory]
  given Decoder[PhotoMemory] = deriveDecoder[PhotoMemory]
