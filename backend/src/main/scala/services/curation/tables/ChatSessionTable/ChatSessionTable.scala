package services.curation.tables

import java.sql.Connection
import java.util.UUID

import cats.effect.IO

import services.curation.objects.{ChatSession, ChatSessionId}
import services.gallery.objects.ExhibitionId
import services.system.db.{RowDecoder, Sql, SqlValue}
import services.users.objects.UserId

/** curation.chat_sessions：用户 ↔ 展览的策展对话会话。 */
object ChatSessionTable:

  private given RowDecoder[ChatSession] = RowDecoder { row =>
    ChatSession(
      id = ChatSessionId(row.getObject("id", classOf[UUID])),
      exhibitionId = ExhibitionId(row.getObject("exhibition_id", classOf[UUID])),
      userId = UserId(row.getObject("user_id", classOf[UUID])),
      createdAt = row.getTimestamp("created_at").toInstant
    )
  }

  private val findLatestSql =
    """SELECT id, exhibition_id, user_id, created_at FROM curation.chat_sessions
      |WHERE exhibition_id = ? AND user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1""".stripMargin

  def findLatestByExhibitionAndUser(
    connection: Connection,
    exhibitionId: ExhibitionId,
    userId: UserId
  ): IO[Option[ChatSession]] =
    Sql.queryOne[ChatSession](
      connection,
      findLatestSql,
      List(SqlValue.Uuid(exhibitionId.value), SqlValue.Uuid(userId.value))
    )

  private val insertSql =
    "INSERT INTO curation.chat_sessions (id, exhibition_id, user_id, created_at) VALUES (?, ?, ?, ?)"

  def insert(connection: Connection, session: ChatSession): IO[Unit] =
    Sql
      .update(
        connection,
        insertSql,
        List(
          SqlValue.Uuid(session.id.value),
          SqlValue.Uuid(session.exhibitionId.value),
          SqlValue.Uuid(session.userId.value),
          SqlValue.InstantValue(session.createdAt)
        )
      )
      .void
