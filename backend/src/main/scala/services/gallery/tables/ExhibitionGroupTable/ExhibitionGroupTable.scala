package services.gallery.tables

import java.sql.Connection
import java.util.UUID

import cats.effect.IO

import services.gallery.objects.{ExhibitionGroup, ExhibitionId, GroupId}
import services.system.db.{RowDecoder, Sql, SqlValue}

/** gallery.exhibition_groups：展览章节（草稿编排）。 */
object ExhibitionGroupTable:
  private given RowDecoder[ExhibitionGroup] = RowDecoder { row =>
    ExhibitionGroup(
      id = GroupId(row.getObject("id", classOf[UUID])),
      exhibitionId = ExhibitionId(row.getObject("exhibition_id", classOf[UUID])),
      title = row.getString("title"),
      narrative = row.getString("narrative"),
      position = row.getInt("position")
    )
  }

  private val listByExhibitionSql =
    """SELECT id, exhibition_id, title, narrative, position
      |FROM gallery.exhibition_groups WHERE exhibition_id = ? ORDER BY position, id""".stripMargin

  def listByExhibition(connection: Connection, exhibitionId: ExhibitionId): IO[List[ExhibitionGroup]] =
    Sql.query[ExhibitionGroup](connection, listByExhibitionSql, List(SqlValue.Uuid(exhibitionId.value)))

  private val deleteByExhibitionSql = "DELETE FROM gallery.exhibition_groups WHERE exhibition_id = ?"

  def deleteByExhibition(connection: Connection, exhibitionId: ExhibitionId): IO[Unit] =
    Sql.update(connection, deleteByExhibitionSql, List(SqlValue.Uuid(exhibitionId.value))).void

  private val insertSql =
    """INSERT INTO gallery.exhibition_groups (id, exhibition_id, title, narrative, position)
      |VALUES (?, ?, ?, ?, ?)""".stripMargin

  def insert(connection: Connection, group: ExhibitionGroup): IO[Unit] =
    Sql
      .update(
        connection,
        insertSql,
        List(
          SqlValue.Uuid(group.id.value),
          SqlValue.Uuid(group.exhibitionId.value),
          SqlValue.Text(group.title),
          SqlValue.Text(group.narrative),
          SqlValue.IntValue(group.position)
        )
      )
      .void
