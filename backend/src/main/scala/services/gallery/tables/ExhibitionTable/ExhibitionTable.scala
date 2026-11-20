package services.gallery.tables

import java.sql.{Connection, ResultSet}
import java.time.Instant
import java.util.UUID

import cats.effect.IO

import services.gallery.objects.{CoverKind, Exhibition, ExhibitionId, PhotoId}
import services.scene.objects.SceneRunId
import services.system.api.{ApiError, ApiException}
import services.system.db.{RowDecoder, Sql, SqlValue}
import services.users.objects.UserId

/** gallery.exhibitions：展览草稿元数据与封面。 */
object ExhibitionTable:
  private val TableLocation = "gallery.exhibitions"

  private given RowDecoder[Exhibition] = RowDecoder { row =>
    Exhibition(
      id = ExhibitionId(row.getObject("id", classOf[UUID])),
      ownerId = UserId(row.getObject("owner_id", classOf[UUID])),
      title = row.getString("title"),
      narrative = row.getString("narrative"),
      curationVersion = row.getInt("curation_version"),
      coverKind = RowDecoder.enumColumn(row, "cover_kind", TableLocation)(CoverKind.fromString),
      coverPhotoId = optionalUuid(row, "cover_photo_id").map(PhotoId.apply),
      coverStorageKey = Option(row.getString("cover_storage_key")),
      coverMime = Option(row.getString("cover_mime")),
      coverWidth = optionalInt(row, "cover_width"),
      coverHeight = optionalInt(row, "cover_height"),
      createdAt = row.getTimestamp("created_at").toInstant,
      updatedAt = row.getTimestamp("updated_at").toInstant,
      currentSceneRunId = Option(row.getObject("current_scene_run_id", classOf[UUID])).map(SceneRunId.apply)
    )
  }

  private val findByIdSql =
    """SELECT id, owner_id, title, narrative, curation_version, cover_kind, cover_photo_id,
      |       cover_storage_key, cover_mime, cover_width, cover_height, created_at, updated_at,
      |       current_scene_run_id
      |FROM gallery.exhibitions WHERE id = ?""".stripMargin

  def findById(connection: Connection, id: ExhibitionId): IO[Option[Exhibition]] =
    Sql.queryOne[Exhibition](connection, findByIdSql, List(SqlValue.Uuid(id.value)))

  private val requireOwnedSql =
    """SELECT id, owner_id, title, narrative, curation_version, cover_kind, cover_photo_id,
      |       cover_storage_key, cover_mime, cover_width, cover_height, created_at, updated_at,
      |       current_scene_run_id
      |FROM gallery.exhibitions WHERE id = ? AND owner_id = ?""".stripMargin

  def requireOwned(connection: Connection, id: ExhibitionId, ownerId: UserId): IO[Exhibition] =
    Sql
      .queryOne[Exhibition](connection, requireOwnedSql, List(SqlValue.Uuid(id.value), SqlValue.Uuid(ownerId.value)))
      .flatMap {
        case Some(exhibition) => IO.pure(exhibition)
        case None => IO.raiseError(ApiException(ApiError.notFound("展览不存在")))
      }

  private val insertSql =
    """INSERT INTO gallery.exhibitions
      |  (id, owner_id, title, narrative, curation_version, cover_kind, cover_photo_id,
      |   cover_storage_key, cover_mime, cover_width, cover_height, created_at, updated_at,
      |   current_scene_run_id)
      |VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""".stripMargin

  def insert(connection: Connection, exhibition: Exhibition): IO[Unit] =
    Sql
      .update(
        connection,
        insertSql,
        List(
          SqlValue.Uuid(exhibition.id.value),
          SqlValue.Uuid(exhibition.ownerId.value),
          SqlValue.Text(exhibition.title),
          SqlValue.Text(exhibition.narrative),
          SqlValue.IntValue(exhibition.curationVersion),
          SqlValue.Text(CoverKind.toString(exhibition.coverKind)),
          nullableUuid(exhibition.coverPhotoId.map(_.value)),
          nullableText(exhibition.coverStorageKey),
          nullableText(exhibition.coverMime),
          nullableInt(exhibition.coverWidth),
          nullableInt(exhibition.coverHeight),
          SqlValue.InstantValue(exhibition.createdAt),
          SqlValue.InstantValue(exhibition.updatedAt),
          exhibition.currentSceneRunId.fold(SqlValue.Null)(runId => SqlValue.Uuid(runId.value))
        )
      )
      .void

  private val touchDraftSql =
    "UPDATE gallery.exhibitions SET curation_version = curation_version + 1, updated_at = ? WHERE id = ?"

  def touchDraft(connection: Connection, id: ExhibitionId, updatedAt: Instant): IO[Unit] =
    Sql.update(connection, touchDraftSql, List(SqlValue.InstantValue(updatedAt), SqlValue.Uuid(id.value))).void

  private val touchUpdatedAtSql = "UPDATE gallery.exhibitions SET updated_at = ? WHERE id = ?"

  /** 只刷新 updated_at 的草稿变更（如位置写入）：不递增 curation_version，因此不使场景过期。 */
  def touchUpdatedAt(connection: Connection, id: ExhibitionId, updatedAt: Instant): IO[Unit] =
    Sql.update(connection, touchUpdatedAtSql, List(SqlValue.InstantValue(updatedAt), SqlValue.Uuid(id.value))).void

  private val listByOwnerSql =
    """SELECT id, owner_id, title, narrative, curation_version, cover_kind, cover_photo_id,
      |       cover_storage_key, cover_mime, cover_width, cover_height, created_at, updated_at,
      |       current_scene_run_id
      |FROM gallery.exhibitions WHERE owner_id = ? ORDER BY updated_at DESC, id""".stripMargin

  def listByOwner(connection: Connection, ownerId: UserId): IO[List[Exhibition]] =
    Sql.query[Exhibition](connection, listByOwnerSql, List(SqlValue.Uuid(ownerId.value)))

  private val listAllSql =
    """SELECT id, owner_id, title, narrative, curation_version, cover_kind, cover_photo_id,
      |       cover_storage_key, cover_mime, cover_width, cover_height, created_at, updated_at,
      |       current_scene_run_id
      |FROM gallery.exhibitions ORDER BY created_at, id""".stripMargin

  /** 一次性历史回填/迁移使用：列出全部展览（含 render 封面存储 key），只读且不含业务逻辑。 */
  def listAll(connection: Connection): IO[List[Exhibition]] =
    Sql.query[Exhibition](connection, listAllSql)

  private val updateMetaSql =
    """UPDATE gallery.exhibitions
      |SET title = ?, narrative = ?, curation_version = curation_version + 1, updated_at = ?
      |WHERE id = ? AND owner_id = ?""".stripMargin

  def updateMeta(
    connection: Connection,
    id: ExhibitionId,
    ownerId: UserId,
    title: String,
    narrative: String,
    updatedAt: Instant
  ): IO[Int] =
    Sql.update(
      connection,
      updateMetaSql,
      List(
        SqlValue.Text(title),
        SqlValue.Text(narrative),
        SqlValue.InstantValue(updatedAt),
        SqlValue.Uuid(id.value),
        SqlValue.Uuid(ownerId.value)
      )
    )

  private val updateCurationSql =
    """UPDATE gallery.exhibitions
      |SET title = ?, narrative = ?, curation_version = curation_version + 1, updated_at = ?
      |WHERE id = ? AND owner_id = ?""".stripMargin

  def updateCuration(
    connection: Connection,
    id: ExhibitionId,
    ownerId: UserId,
    title: String,
    narrative: String,
    updatedAt: Instant
  ): IO[Unit] =
    Sql
      .update(
        connection,
        updateCurationSql,
        List(
          SqlValue.Text(title),
          SqlValue.Text(narrative),
          SqlValue.InstantValue(updatedAt),
          SqlValue.Uuid(id.value),
          SqlValue.Uuid(ownerId.value)
        )
      )
      .void

  private val deleteSql = "DELETE FROM gallery.exhibitions WHERE id = ? AND owner_id = ?"

  def delete(connection: Connection, id: ExhibitionId, ownerId: UserId): IO[Int] =
    Sql.update(connection, deleteSql, List(SqlValue.Uuid(id.value), SqlValue.Uuid(ownerId.value)))

  private val updateCoverSql =
    """UPDATE gallery.exhibitions
      |SET cover_kind = ?, cover_photo_id = ?, cover_storage_key = NULL, cover_mime = NULL,
      |    cover_width = ?, cover_height = ?, updated_at = ?
      |WHERE id = ? AND owner_id = ?""".stripMargin

  def updateCover(
    connection: Connection,
    id: ExhibitionId,
    ownerId: UserId,
    kind: CoverKind,
    photoId: Option[PhotoId],
    width: Option[Int],
    height: Option[Int],
    updatedAt: Instant
  ): IO[Unit] =
    Sql
      .update(
        connection,
        updateCoverSql,
        List(
          SqlValue.Text(CoverKind.toString(kind)),
          nullableUuid(photoId.map(_.value)),
          nullableInt(width),
          nullableInt(height),
          SqlValue.InstantValue(updatedAt),
          SqlValue.Uuid(id.value),
          SqlValue.Uuid(ownerId.value)
        )
      )
      .void

  private val updateRenderCoverSql =
    """UPDATE gallery.exhibitions
      |SET cover_kind = 'render', cover_photo_id = NULL, cover_storage_key = ?, cover_mime = ?,
      |    cover_width = ?, cover_height = ?, updated_at = ?
      |WHERE id = ? AND owner_id = ?""".stripMargin

  def updateRenderCover(
    connection: Connection,
    id: ExhibitionId,
    ownerId: UserId,
    storageKey: String,
    mimeType: String,
    width: Int,
    height: Int,
    updatedAt: Instant
  ): IO[Unit] =
    Sql
      .update(
        connection,
        updateRenderCoverSql,
        List(
          SqlValue.Text(storageKey),
          SqlValue.Text(mimeType),
          SqlValue.IntValue(width),
          SqlValue.IntValue(height),
          SqlValue.InstantValue(updatedAt),
          SqlValue.Uuid(id.value),
          SqlValue.Uuid(ownerId.value)
        )
      )
      .void

  private val clearCoverPhotoSql =
    """UPDATE gallery.exhibitions
      |SET cover_kind = 'auto', cover_photo_id = NULL, cover_width = NULL, cover_height = NULL
      |WHERE cover_photo_id = ?""".stripMargin

  def clearCoverPhoto(connection: Connection, photoId: PhotoId): IO[Unit] =
    Sql.update(connection, clearCoverPhotoSql, List(SqlValue.Uuid(photoId.value))).void

  private val setCurrentSceneRunSql =
    """UPDATE gallery.exhibitions
      |SET current_scene_run_id = ?, updated_at = ?
      |WHERE id = ?""".stripMargin

  /** 设置「当前采用场景」指针（v1.14）。
    *
    * gallery 只负责封装 SQL；运行归属/状态/素材版本与父版本是否仍为当前由调用方在同一连接事务内校验后才能调用
    * （acceptscenerun / 普通生成成功 / 恢复成功），表方法不重复业务判断。
    */
  def setCurrentSceneRun(
    connection: Connection,
    id: ExhibitionId,
    runId: SceneRunId,
    updatedAt: Instant
  ): IO[Int] =
    Sql.update(
      connection,
      setCurrentSceneRunSql,
      List(SqlValue.Uuid(runId.value), SqlValue.InstantValue(updatedAt), SqlValue.Uuid(id.value))
    )

  private val fillCurrentSceneRunIfMissingSql =
    """UPDATE gallery.exhibitions
      |SET current_scene_run_id = ?
      |WHERE id = ? AND current_scene_run_id IS NULL""".stripMargin

  /** 一次性指针回填专用（不挂常规启动）：只填空指针，重跑不覆盖已设置指针、不刷新 updated_at。 */
  def fillCurrentSceneRunIfMissing(
    connection: Connection,
    id: ExhibitionId,
    runId: SceneRunId
  ): IO[Int] =
    Sql.update(
      connection,
      fillCurrentSceneRunIfMissingSql,
      List(SqlValue.Uuid(runId.value), SqlValue.Uuid(id.value))
    )

  private def optionalUuid(row: ResultSet, column: String): Option[UUID] =
    Option(row.getObject(column, classOf[UUID]))

  private def optionalInt(row: ResultSet, column: String): Option[Int] =
    Option(row.getObject(column)).collect { case number: java.lang.Number => number.intValue }

  private def nullableUuid(value: Option[UUID]): SqlValue =
    value.fold(SqlValue.Null)(SqlValue.Uuid.apply)

  private def nullableText(value: Option[String]): SqlValue =
    value.fold(SqlValue.Null)(SqlValue.Text.apply)

  private def nullableInt(value: Option[Int]): SqlValue =
    value.fold(SqlValue.Null)(SqlValue.IntValue.apply)
