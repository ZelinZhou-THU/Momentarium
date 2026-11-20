package services.gallery.objects

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/** 发布快照中冻结的已采用讲述：只含正文与署名，不写来源投稿 id 或投稿者账号。 */
final case class SnapshotMemory(
  text: String,
  contributorName: String
)

object SnapshotMemory:
  given Encoder[SnapshotMemory] = deriveEncoder[SnapshotMemory]
  given Decoder[SnapshotMemory] = deriveDecoder[SnapshotMemory]
