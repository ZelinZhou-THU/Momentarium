package services.gallery.tables

import java.sql.Connection
import java.time.Instant
import java.util.UUID

import cats.effect.IO
import io.circe.syntax.*

import services.gallery.objects.*
import services.system.db.{RowDecoder, Sql, SqlValue}
import services.users.objects.UserId

/** gallery.publications：不可变发布快照；唯一 (exhibition_id, version)，部分唯一索引保证同一展览最多一个 active。 */
object PublicationTable:
  private val TableLocation = "gallery.publications"

  private given RowDecoder[Publication] = RowDecoder { row =>
    Publication(
      id = PublicationId(row.getObject("id", classOf[UUID])),
      exhibitionId = ExhibitionId(row.getObject("exhibition_id", classOf[UUID])),
      version = row.getInt("version"),
      snapshot =
        RowDecoder.jsonColumn[PublicationSnapshot](row, "snapshot_json", TableLocation),
      status = RowDecoder.enumColumn(row, "status", TableLocation)(PublicationStatus.fromString),
      createdAt = row.getTimestamp("created_at").toInstant,
      supersededAt = Option(row.getTimestamp("superseded_at")).map(_.toInstant)
    )
  }

  private val selectColumns =
    """SELECT id, exhibition_id, version, snapshot_json, status, created_at, superseded_at
      |FROM gallery.publications""".stripMargin

  private val insertSql =
    """INSERT INTO gallery.publications
      |  (id, exhibition_id, version, snapshot_json, status, created_at, superseded_at)
      |VALUES (?, ?, ?, ?, ?, ?, ?)""".stripMargin

  def insert(connection: Connection, publication: Publication): IO[Unit] =
    Sql
      .update(
        connection,
        insertSql,
        List(
          SqlValue.Uuid(publication.id.value),
          SqlValue.Uuid(publication.exhibitionId.value),
          SqlValue.IntValue(publication.version),
          SqlValue.JsonValue(publication.snapshot.asJson.noSpaces),
          SqlValue.Text(PublicationStatus.toString(publication.status)),
          SqlValue.InstantValue(publication.createdAt),
          publication.supersededAt.fold(SqlValue.Null)(SqlValue.InstantValue.apply)
        )
      )
      .void

  private val findActiveSql =
    s"$selectColumns WHERE exhibition_id = ? AND status = 'active' ORDER BY version DESC LIMIT 1"

  /** integration-points §4 冻结方法：公开读只信任 active 快照。 */
  def findActive(connection: Connection, exhibitionId: ExhibitionId): IO[Option[Publication]] =
    Sql.queryOne[Publication](connection, findActiveSql, List(SqlValue.Uuid(exhibitionId.value)))

  private val listActiveByOwnerSql =
    """SELECT p.id, p.exhibition_id, p.version, p.snapshot_json, p.status, p.created_at, p.superseded_at
      |FROM gallery.publications p
      |JOIN gallery.exhibitions e ON e.id = p.exhibition_id
      |WHERE e.owner_id = ? AND p.status = 'active'
      |ORDER BY p.created_at DESC, p.id DESC""".stripMargin

  /** 作者主页：该用户全部展览的 active 快照，最近发布在前。 */
  def listActiveByOwner(connection: Connection, ownerId: UserId): IO[List[Publication]] =
    Sql.query[Publication](connection, listActiveByOwnerSql, List(SqlValue.Uuid(ownerId.value)))

  private val findMaxVersionSql =
    "SELECT coalesce(max(version), 0) FROM gallery.publications WHERE exhibition_id = ?"

  def findMaxVersion(connection: Connection, exhibitionId: ExhibitionId): IO[Int] =
    Sql
      .queryOne[Int](connection, findMaxVersionSql, List(SqlValue.Uuid(exhibitionId.value)))
      .map(_.getOrElse(0))

  private val supersedeActiveSql =
    """UPDATE gallery.publications
      |SET status = 'superseded', superseded_at = ?
      |WHERE exhibition_id = ? AND status = 'active'""".stripMargin

  def supersedeActive(connection: Connection, exhibitionId: ExhibitionId, supersededAt: Instant): IO[Unit] =
    Sql
      .update(connection, supersedeActiveSql, List(SqlValue.InstantValue(supersededAt), SqlValue.Uuid(exhibitionId.value)))
      .void
