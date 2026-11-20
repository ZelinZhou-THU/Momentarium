package services.curation.tables

import java.sql.Connection

import cats.effect.IO

import services.system.db.Sql

/** curation.chat_sessions 建表与初始化。 */
object ChatSessionTableInitializer:
  private val createSchemaSql = "CREATE SCHEMA IF NOT EXISTS curation"

  private val createChatSessionsTableSql =
    """CREATE TABLE IF NOT EXISTS curation.chat_sessions (
      |  id uuid PRIMARY KEY,
      |  exhibition_id uuid NOT NULL,
      |  user_id uuid NOT NULL,
      |  created_at timestamptz NOT NULL
      |)""".stripMargin

  private val createExhibitionUserIndexSql =
    "CREATE INDEX IF NOT EXISTS idx_curation_chat_sessions_exhibition_user ON curation.chat_sessions (exhibition_id, user_id)"

  def initialize(connection: Connection): IO[Unit] =
    for
      _ <- Sql.update(connection, createSchemaSql)
      _ <- Sql.update(connection, createChatSessionsTableSql)
      _ <- Sql.update(connection, createExhibitionUserIndexSql)
    yield ()
