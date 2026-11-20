package services.gallery.tables

import java.sql.Connection
import java.time.Instant
import java.util.UUID

import cats.effect.IO

import services.gallery.objects.*
import services.system.db.{RowDecoder, Sql, SqlValue}
import services.users.objects.UserId

/** gallery.photo_memories：照片上已采用的讲述（冻结时的署名与采用版本）；按采用顺序（created_at, id）。 */
object PhotoMemoryTable:
  private given RowDecoder[PhotoMemory] = RowDecoder { row =>
    PhotoMemory(
      id = PhotoMemoryId(row.getObject("id", classOf[UUID])),
      photoId = PhotoId(row.getObject("photo_id", classOf[UUID])),
      contributionId = ContributionId(row.getObject("contribution_id", classOf[UUID])),
      contributorUserId = UserId(row.getObject("contributor_user_id", classOf[UUID])),
      contributorName = row.getString("contributor_name"),
      text = row.getString("text"),
      adoptedVersion = row.getInt("adopted_version"),
      createdAt = row.getTimestamp("created_at").toInstant,
      updatedAt = row.getTimestamp("updated_at").toInstant
    )
  }

  private val selectColumns =
    """SELECT id, photo_id, contribution_id, contributor_user_id, contributor_name, text,
      |       adopted_version, created_at, updated_at
      |FROM gallery.photo_memories""".stripMargin

  private val insertSql =
    """INSERT INTO gallery.photo_memories
      |  (id, photo_id, contribution_id, contributor_user_id, contributor_name, text,
      |   adopted_version, created_at, updated_at)
      |VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""".stripMargin

  def insert(connection: Connection, memory: PhotoMemory): IO[Unit] =
    Sql
      .update(
        connection,
        insertSql,
        List(
          SqlValue.Uuid(memory.id.value),
          SqlValue.Uuid(memory.photoId.value),
          SqlValue.Uuid(memory.contributionId.value),
          SqlValue.Uuid(memory.contributorUserId.value),
          SqlValue.Text(memory.contributorName),
          SqlValue.Text(memory.text),
          SqlValue.IntValue(memory.adoptedVersion),
          SqlValue.InstantValue(memory.createdAt),
          SqlValue.InstantValue(memory.updatedAt)
        )
      )
      .void

  private val findByContributionIdSql = s"$selectColumns WHERE contribution_id = ?"

  /** 采用目标锁：一条投稿最多一条已采用讲述（contribution_id 唯一）。 */
  def findByContributionId(connection: Connection, contributionId: ContributionId): IO[Option[PhotoMemory]] =
    Sql.queryOne[PhotoMemory](connection, findByContributionIdSql, List(SqlValue.Uuid(contributionId.value)))

  private val findByIdSql = s"$selectColumns WHERE id = ?"

  def findById(connection: Connection, id: PhotoMemoryId): IO[Option[PhotoMemory]] =
    Sql.queryOne[PhotoMemory](connection, findByIdSql, List(SqlValue.Uuid(id.value)))

  private val listByPhotoIdsSql = s"$selectColumns WHERE photo_id = ANY(?::uuid[]) ORDER BY created_at, id"

  /** 一次取多张照片的讲述（草稿视图、发布冻结、hasUnpublishedChanges 投影共用）。 */
  def listByPhotoIds(connection: Connection, photoIds: List[PhotoId]): IO[List[PhotoMemory]] =
    if photoIds.isEmpty then IO.pure(Nil)
    else
      val arrayLiteral = photoIds.map(_.value.toString).mkString("{", ",", "}")
      Sql.query[PhotoMemory](connection, listByPhotoIdsSql, List(SqlValue.Text(arrayLiteral)))

  private val listByPhotoIdSql = s"$selectColumns WHERE photo_id = ? ORDER BY created_at, id"

  def listByPhotoId(connection: Connection, photoId: PhotoId): IO[List[PhotoMemory]] =
    Sql.query[PhotoMemory](connection, listByPhotoIdSql, List(SqlValue.Uuid(photoId.value)))

  private val updateSql =
    """UPDATE gallery.photo_memories
      |SET text = ?, contributor_name = ?, adopted_version = ?, updated_at = ?
      |WHERE id = ?""".stripMargin

  /** 同一投稿新版本再次采用同一目标：原地更新讲述与署名（保持创建顺序）。 */
  def update(
    connection: Connection,
    id: PhotoMemoryId,
    text: String,
    contributorName: String,
    adoptedVersion: Int,
    now: Instant
  ): IO[Unit] =
    Sql
      .update(
        connection,
        updateSql,
        List(
          SqlValue.Text(text),
          SqlValue.Text(contributorName),
          SqlValue.IntValue(adoptedVersion),
          SqlValue.InstantValue(now),
          SqlValue.Uuid(id.value)
        )
      )
      .void

  private val deleteSql = "DELETE FROM gallery.photo_memories WHERE id = ? AND photo_id = ?"

  def delete(connection: Connection, photoId: PhotoId, memoryId: PhotoMemoryId): IO[Int] =
    Sql.update(connection, deleteSql, List(SqlValue.Uuid(memoryId.value), SqlValue.Uuid(photoId.value)))
