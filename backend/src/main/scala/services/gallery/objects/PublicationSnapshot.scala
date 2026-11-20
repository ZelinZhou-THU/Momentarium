package services.gallery.objects

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.scene.objects.SceneRunId

/** 发布快照内容（DR-23）：冻结的标题/叙事/章节与照片顺序/封面/场景引用；公开读只信任这份快照。
  * scenePalette 是所绑定场景题面的主色（v0.9.8，展览界面配色的来源）；此前的快照没有该字段，解码为 None。
  * locations 是冻结的公开位置（v1.7）；此前的快照没有该字段，解码为 None（公开视图按空数组返回）。 */
final case class PublicationSnapshot(
  version: Int,
  publishedAt: Instant,
  curationVersion: Int,
  title: String,
  narrative: String,
  narration: String,
  cover: SnapshotCover,
  groups: List[SnapshotGroup],
  photos: List[SnapshotPhoto],
  sceneRunId: Option[SceneRunId],
  sceneCode: Option[String],
  sceneRuntimeVersion: Option[String],
  sceneGeneratedAt: Option[Instant],
  scenePalette: Option[List[String]],
  locations: Option[List[SnapshotLocation]] = None
)

object PublicationSnapshot:
  given Encoder[PublicationSnapshot] = deriveEncoder[PublicationSnapshot]
  given Decoder[PublicationSnapshot] = deriveDecoder[PublicationSnapshot]
