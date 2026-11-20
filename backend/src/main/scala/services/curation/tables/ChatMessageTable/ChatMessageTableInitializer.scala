package services.curation.tables

import java.sql.Connection

import cats.effect.IO

import services.system.db.Sql

/** curation.chat_messages 建表与初始化；需在 chat_sessions 之后执行（外键依赖）。 */
object ChatMessageTableInitializer:
  private val createChatMessagesTableSql =
    """CREATE TABLE IF NOT EXISTS curation.chat_messages (
      |  id uuid PRIMARY KEY,
      |  session_id uuid NOT NULL REFERENCES curation.chat_sessions(id) ON DELETE CASCADE,
      |  role text NOT NULL,
      |  content text NOT NULL,
      |  created_at timestamptz NOT NULL
      |)""".stripMargin

  private val createSessionIndexSql =
    "CREATE INDEX IF NOT EXISTS idx_curation_chat_messages_session ON curation.chat_messages (session_id)"

  def initialize(connection: Connection): IO[Unit] =
    for
      _ <- Sql.update(connection, createChatMessagesTableSql)
      _ <- Sql.update(connection, createSessionIndexSql)
    yield ()
