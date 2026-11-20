package services.gallery.utils

import java.nio.file.Path
import java.sql.Connection
import java.time.Instant

import cats.effect.IO

import services.gallery.objects.{ExhibitionPhoto, PhotoMemory}
import services.gallery.tables.{ExhibitionPhotoTable, ExhibitionTable, PublicationTable}

/** 采用生命周期清理（v2.7）：移除讲述/撤回投稿/删除照片共用的“删除或归档草稿照片”逻辑。
  *
  * 规则（api-contract v1.11.1 + B2 补丁）：
  * - 被 **active** 发布快照引用的照片只归档（`archived_at`），公开页仍可读，文件保留；
  *   superseded-only 快照不阻止物理删除（公开页只读 active，历史快照 JSON 不改写）；
  * - 否则物理删除行、清空指向它的封面，并返回提交后应删除的原图/缩略图/展示文件 key；
  * - 照片是否“由投稿采用新建”用显式 `adopted_from_contribution_id` 判断（任意投稿均算，不要求当前讲述的投稿）；
  *   旧行字段为 NULL 时保留 created_at 时间戳 fallback（与已采用讲述同刻创建 = 采用新建）。
  */
private[gallery] object PhotoRemoval:
  /** 物理删除后待清理的文件 key（归档不删文件）。 */
  def fileKeys(photo: ExhibitionPhoto): List[String] =
    List(photo.storageKey, photo.thumbKey, PhotoStorage.displayKey(photo.exhibitionId, photo.id))

  /** 照片是否由投稿采用新建：显式 origin 非空即为真；旧数据 origin 为 NULL 时回退到讲述同刻时间戳。 */
  def isAdoptionPhoto(photo: ExhibitionPhoto, memory: PhotoMemory): Boolean =
    photo.adoptedFromContributionId.isDefined || photo.createdAt == memory.createdAt

  /** 删除或归档照片：归档返回 Nil（文件保留），物理删除返回待删文件 key 并清空封面。
    * 归档条件仅看 active 快照；superseded-only 引用的照片仍物理删除。 */
  def removeOrArchive(connection: Connection, photo: ExhibitionPhoto, now: Instant): IO[List[String]] =
    PublicationTable.findActive(connection, photo.exhibitionId).flatMap { active =>
      val published = active.exists(publication => PublicationViews.snapshotContainsPhoto(publication, photo.id))
      if published then ExhibitionPhotoTable.archive(connection, photo.id, now).as(Nil)
      else
        ExhibitionPhotoTable.deleteById(connection, photo.id) *>
          ExhibitionTable.clearCoverPhoto(connection, photo.id) *>
          IO.pure(fileKeys(photo))
    }

  /** 事务提交后清理文件；失败忽略（避免已提交的删除因文件清理失败回滚业务结果）。 */
  def deleteFiles(dataDirectory: Path, keys: List[String]): IO[Unit] =
    PhotoStorage.delete(dataDirectory, keys).attempt.void
