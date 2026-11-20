package services.gallery.objects

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.scene.objects.SceneRunId
import services.users.objects.UserId

/**
 * gallery.exhibitions 行：展览草稿的元数据与当前封面。
 * currentSceneRunId 是唯一「当前采用场景」指针（v1.14）：普通生成/恢复成功自动更新，
 * 修订成功只是候选、不切指针；空指针表示从未成功生成或迁移前未回填。
 */
final case class Exhibition(
  id: ExhibitionId,
  ownerId: UserId,
  title: String,
  narrative: String,
  curationVersion: Int,
  coverKind: CoverKind,
  coverPhotoId: Option[PhotoId],
  coverStorageKey: Option[String],
  coverMime: Option[String],
  coverWidth: Option[Int],
  coverHeight: Option[Int],
  createdAt: Instant,
  updatedAt: Instant,
  currentSceneRunId: Option[SceneRunId] = None
)

object Exhibition:
  given Encoder[Exhibition] = deriveEncoder[Exhibition]
  given Decoder[Exhibition] = deriveDecoder[Exhibition]
