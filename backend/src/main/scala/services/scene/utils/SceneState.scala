package services.scene.utils

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.{Exhibition, ExhibitionGroup, ExhibitionPhoto}
import services.gallery.tables.{ExhibitionGroupTable, ExhibitionPhotoTable, PhotoMemoryTable}
import services.system.ai.PromptExcerpts

/** 一次场景生成所需的权威策展快照：展览元数据 + 章节 + 未归档照片（AI 只读）。 */
private[scene] final case class SceneState(
  exhibition: Exhibition,
  groups: List[ExhibitionGroup],
  photos: List[ExhibitionPhoto],
  /** 已采用的讲述摘录（photoId → 摘录；已清洗、截断、封顶，不含投稿者姓名）。 */
  memories: Map[services.gallery.objects.PhotoId, List[String]] = Map.empty
):
  def photoIds: Set[services.gallery.objects.PhotoId] = photos.map(_.id).toSet

  def containsGroup(groupId: services.gallery.objects.GroupId): Boolean =
    groups.exists(_.id == groupId)

private[scene] object SceneState:
  def load(connection: Connection, exhibition: Exhibition): IO[SceneState] =
    for
      groups <- ExhibitionGroupTable.listByExhibition(connection, exhibition.id)
      allPhotos <- ExhibitionPhotoTable.listByExhibition(connection, exhibition.id)
      photos = allPhotos.filter(_.archivedAt.isEmpty)
      memories <- PhotoMemoryTable.listByPhotoIds(connection, photos.map(_.id))
    yield SceneState(
      exhibition,
      groups,
      photos,
      PromptExcerpts.byKey(photos.map(photo => photo.id -> memories.filter(_.photoId == photo.id).map(_.text)))
    )
