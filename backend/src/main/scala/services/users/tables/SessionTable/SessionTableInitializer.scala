package services.users.tables

import java.sql.Connection

import cats.effect.IO

import services.system.db.Sql

/** users.sessions 建表与索引初始化。 */
object SessionTableInitializer:
  private val createSchemaSql = "CREATE SCHEMA IF NOT EXISTS users"

  private val createSessionsTableSql =
    """CREATE TABLE IF NOT EXISTS users.sessions (
      |  token_hash text PRIMARY KEY,
      |  user_id uuid NOT NULL,
      |  created_at timestamptz NOT NULL,
      |  expires_at timestamptz NOT NULL
      |)""".stripMargin

  private val createUserIdIndexSql =
    "CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON users.sessions (user_id)"

  def initialize(connection: Connection): IO[Unit] =
    for
      _ <- Sql.update(connection, createSchemaSql)
      _ <- Sql.update(connection, createSessionsTableSql)
      _ <- Sql.update(connection, createUserIdIndexSql)
    yield ()
