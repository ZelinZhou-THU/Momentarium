package services.curation.utils

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.{Exhibition, ExhibitionGroup, ExhibitionPhoto}
import services.gallery.tables.{ExhibitionGroupTable, ExhibitionPhotoTable, PhotoMemoryTable}
import services.system.ai.PromptExcerpts

/** 一次策展运算所需的权威草稿状态：展览元数据 + 章节 + 未归档照片（服务端为准，AI 只读）。 */
private[curation] final case class CurationState(
  exhibition: Exhibition,
  groups: List[ExhibitionGroup],
  photos: List[ExhibitionPhoto],
  /** 已采用的讲述摘录（photoId → 摘录；已清洗、截断、封顶，不含投稿者姓名）。 */
  memories: Map[services.gallery.objects.PhotoId, List[String]] = Map.empty
):
  def photoIds: Set[services.gallery.objects.PhotoId] = photos.map(_.id).toSet

private[curation] object CurationState:
  /** 通过 gallery 公开表方法读取；archived 照片不参与新的策展运算。 */
  def load(connection: Connection, exhibition: Exhibition): IO[CurationState] =
    for
      groups <- ExhibitionGroupTable.listByExhibition(connection, exhibition.id)
      allPhotos <- ExhibitionPhotoTable.listByExhibition(connection, exhibition.id)
      photos = allPhotos.filter(_.archivedAt.isEmpty)
      memories <- PhotoMemoryTable.listByPhotoIds(connection, photos.map(_.id))
    yield CurationState(
      exhibition,
      groups,
      photos,
      PromptExcerpts.byKey(photos.map(photo => photo.id -> memories.filter(_.photoId == photo.id).map(_.text)))
    )
