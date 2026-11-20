package services.gallery.tables

import java.sql.{Connection, ResultSet}
import java.time.Instant
import java.util.UUID

import cats.effect.IO

import services.gallery.objects.{ContributionId, ExhibitionId, ExhibitionPhoto, GroupId, PhotoId}
import services.system.db.{RowDecoder, Sql, SqlValue}

/** gallery.exhibition_photos：照片文件元数据与草稿编排位置。 */
object ExhibitionPhotoTable:
  private given RowDecoder[ExhibitionPhoto] = RowDecoder { row =>
    ExhibitionPhoto(
      id = PhotoId(row.getObject("id", classOf[UUID])),
      exhibitionId = ExhibitionId(row.getObject("exhibition_id", classOf[UUID])),
      storageKey = row.getString("storage_key"),
      thumbKey = row.getString("thumb_key"),
      originalName = row.getString("original_name"),
      mime = row.getString("mime"),
      width = optionalInt(row, "width"),
      height = optionalInt(row, "height"),
      groupId = optionalUuid(row, "group_id").map(GroupId.apply),
      positionInGroup = optionalInt(row, "position_in_group"),
      caption = row.getString("caption"),
      archivedAt = optionalInstant(row, "archived_at"),
      createdAt = row.getTimestamp("created_at").toInstant,
      adoptedFromContributionId = optionalUuid(row, "adopted_from_contribution_id").map(ContributionId.apply)
    )
  }

  private val selectColumns =
    """SELECT id, exhibition_id, storage_key, thumb_key, original_name, mime, width, height,
      |       group_id, position_in_group, caption, archived_at, created_at, adopted_from_contribution_id
      |FROM gallery.exhibition_photos""".stripMargin

  private val findByIdSql = s"$selectColumns WHERE id = ?"

  def findById(connection: Connection, id: PhotoId): IO[Option[ExhibitionPhoto]] =
    Sql.queryOne[ExhibitionPhoto](connection, findByIdSql, List(SqlValue.Uuid(id.value)))

  private val listByExhibitionSql =
    s"$selectColumns WHERE exhibition_id = ? ORDER BY position_in_group ASC NULLS LAST, created_at, id"

  def listByExhibition(connection: Connection, exhibitionId: ExhibitionId): IO[List[ExhibitionPhoto]] =
    Sql.query[ExhibitionPhoto](connection, listByExhibitionSql, List(SqlValue.Uuid(exhibitionId.value)))

  private val listAllSql = s"$selectColumns ORDER BY created_at, id"

  /** 一次性历史回填/迁移使用：列出全部照片（含已归档），只读且不含业务逻辑。 */
  def listAll(connection: Connection): IO[List[ExhibitionPhoto]] =
    Sql.query[ExhibitionPhoto](connection, listAllSql)

  private val countByExhibitionSql =
    "SELECT count(*) FROM gallery.exhibition_photos WHERE exhibition_id = ? AND archived_at IS NULL"

  def countByExhibition(connection: Connection, exhibitionId: ExhibitionId): IO[Int] =
    Sql
      .queryOne[Int](connection, countByExhibitionSql, List(SqlValue.Uuid(exhibitionId.value)))
      .map(_.getOrElse(0))

  private val insertSql =
    """INSERT INTO gallery.exhibition_photos
      |  (id, exhibition_id, storage_key, thumb_key, original_name, mime, width, height,
      |   group_id, position_in_group, caption, archived_at, created_at, adopted_from_contribution_id)
      |VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""".stripMargin

  def insert(connection: Connection, photo: ExhibitionPhoto): IO[Unit] =
    Sql
      .update(
        connection,
        insertSql,
        List(
          SqlValue.Uuid(photo.id.value),
          SqlValue.Uuid(photo.exhibitionId.value),
          SqlValue.Text(photo.storageKey),
          SqlValue.Text(photo.thumbKey),
          SqlValue.Text(photo.originalName),
          SqlValue.Text(photo.mime),
          nullableInt(photo.width),
          nullableInt(photo.height),
          nullableUuid(photo.groupId.map(_.value)),
          nullableInt(photo.positionInGroup),
          SqlValue.Text(photo.caption),
          nullableInstant(photo.archivedAt),
          SqlValue.InstantValue(photo.createdAt),
          nullableUuid(photo.adoptedFromContributionId.map(_.value))
        )
      )
      .void

  private val updatePlacementSql =
    """UPDATE gallery.exhibition_photos
      |SET group_id = ?, position_in_group = ?, caption = ?
      |WHERE id = ? AND exhibition_id = ?""".stripMargin

  def updatePlacement(
    connection: Connection,
    photoId: PhotoId,
    exhibitionId: ExhibitionId,
    groupId: GroupId,
    positionInGroup: Int,
    caption: String
  ): IO[Unit] =
    Sql
      .update(
        connection,
        updatePlacementSql,
        List(
          SqlValue.Uuid(groupId.value),
          SqlValue.IntValue(positionInGroup),
          SqlValue.Text(caption),
          SqlValue.Uuid(photoId.value),
          SqlValue.Uuid(exhibitionId.value)
        )
      )
      .void

  private val updateCaptionSql = "UPDATE gallery.exhibition_photos SET caption = ? WHERE id = ? AND exhibition_id = ?"

  /** 投稿采用原地更新时只改图注（不碰文件与编排）。 */
  def updateCaption(connection: Connection, photoId: PhotoId, exhibitionId: ExhibitionId, caption: String): IO[Unit] =
    Sql
      .update(connection, updateCaptionSql, List(SqlValue.Text(caption), SqlValue.Uuid(photoId.value), SqlValue.Uuid(exhibitionId.value)))
      .void

  private val updateFileSql =
    """UPDATE gallery.exhibition_photos
      |SET storage_key = ?, thumb_key = ?, original_name = ?, mime = ?, width = ?, height = ?
      |WHERE id = ? AND exhibition_id = ?""".stripMargin

  /** 投稿新版本再次采用同一“新建照片”目标时替换草稿照片文件（文件变体随格式扩展到 key）。 */
  def updateFile(
    connection: Connection,
    photoId: PhotoId,
    exhibitionId: ExhibitionId,
    storageKey: String,
    thumbKey: String,
    originalName: String,
    mime: String,
    width: Option[Int],
    height: Option[Int]
  ): IO[Unit] =
    Sql
      .update(
        connection,
        updateFileSql,
        List(
          SqlValue.Text(storageKey),
          SqlValue.Text(thumbKey),
          SqlValue.Text(originalName),
          SqlValue.Text(mime),
          nullableInt(width),
          nullableInt(height),
          SqlValue.Uuid(photoId.value),
          SqlValue.Uuid(exhibitionId.value)
        )
      )
      .void

  private val archiveSql = "UPDATE gallery.exhibition_photos SET archived_at = ? WHERE id = ?"

  /** 被 active 发布快照引用的照片只归档，不物理删除（公开页仍可读）。 */
  def archive(connection: Connection, id: PhotoId, archivedAt: Instant): IO[Unit] =
    Sql.update(connection, archiveSql, List(SqlValue.InstantValue(archivedAt), SqlValue.Uuid(id.value))).void

  private val deleteByIdSql = "DELETE FROM gallery.exhibition_photos WHERE id = ?"

  def deleteById(connection: Connection, id: PhotoId): IO[Unit] =
    Sql.update(connection, deleteByIdSql, List(SqlValue.Uuid(id.value))).void

  private def optionalUuid(row: ResultSet, column: String): Option[UUID] =
    Option(row.getObject(column, classOf[UUID]))

  private def optionalInt(row: ResultSet, column: String): Option[Int] =
    Option(row.getObject(column)).collect { case number: java.lang.Number => number.intValue }

  private def optionalInstant(row: ResultSet, column: String): Option[Instant] =
    Option(row.getTimestamp(column)).map(_.toInstant)

  private def nullableUuid(value: Option[UUID]): SqlValue =
    value.fold(SqlValue.Null)(SqlValue.Uuid.apply)

  private def nullableInt(value: Option[Int]): SqlValue =
    value.fold(SqlValue.Null)(SqlValue.IntValue.apply)

  private def nullableInstant(value: Option[Instant]): SqlValue =
    value.fold(SqlValue.Null)(SqlValue.InstantValue.apply)
