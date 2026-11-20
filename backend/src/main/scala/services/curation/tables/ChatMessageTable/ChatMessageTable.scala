package services.curation.tables

import java.sql.Connection
import java.util.UUID

import cats.effect.IO

import services.curation.objects.{ChatMessage, ChatMessageId, ChatRole, ChatSessionId}
import services.system.db.{RowDecoder, Sql, SqlValue}

/** curation.chat_messages：对话消息（外键指向 chat_sessions，删除会话级联清理）。 */
object ChatMessageTable:

  private val TableLocation = "curation.chat_messages"

  private given RowDecoder[ChatMessage] = RowDecoder { row =>
    ChatMessage(
      id = ChatMessageId(row.getObject("id", classOf[UUID])),
      sessionId = ChatSessionId(row.getObject("session_id", classOf[UUID])),
      role = RowDecoder.enumColumn(row, "role", TableLocation)(ChatRole.fromString),
      content = row.getString("content"),
      createdAt = row.getTimestamp("created_at").toInstant
    )
  }

  private val listBySessionSql =
    """SELECT id, session_id, role, content, created_at FROM curation.chat_messages
      |WHERE session_id = ? ORDER BY created_at, id""".stripMargin

  def listBySession(connection: Connection, sessionId: ChatSessionId): IO[List[ChatMessage]] =
    Sql.query[ChatMessage](connection, listBySessionSql, List(SqlValue.Uuid(sessionId.value)))

  private val listRecentSql =
    """SELECT id, session_id, role, content, created_at FROM curation.chat_messages
      |WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT ?""".stripMargin

  /** 取最近 limit 条，返回时按时间正序（便于直接拼进提示词）。 */
  def listRecent(connection: Connection, sessionId: ChatSessionId, limit: Int): IO[List[ChatMessage]] =
    Sql
      .query[ChatMessage](
        connection,
        listRecentSql,
        List(SqlValue.Uuid(sessionId.value), SqlValue.IntValue(limit))
      )
      .map(_.reverse)

  private val insertSql =
    "INSERT INTO curation.chat_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)"

  def insert(connection: Connection, message: ChatMessage): IO[Unit] =
    Sql
      .update(
        connection,
        insertSql,
        List(
          SqlValue.Uuid(message.id.value),
          SqlValue.Uuid(message.sessionId.value),
          SqlValue.Text(ChatRole.toString(message.role)),
          SqlValue.Text(message.content),
          SqlValue.InstantValue(message.createdAt)
        )
      )
      .void
