package services.users.tables

import java.sql.Connection

import cats.effect.IO

import services.system.db.Sql

/** users.users 建表与初始化。 */
object UserTableInitializer:
  private val createSchemaSql = "CREATE SCHEMA IF NOT EXISTS users"

  private val createUsersTableSql =
    """CREATE TABLE IF NOT EXISTS users.users (
      |  id uuid PRIMARY KEY,
      |  username text NOT NULL UNIQUE,
      |  password_hash text NOT NULL,
      |  created_at timestamptz NOT NULL
      |)""".stripMargin

  def initialize(connection: Connection): IO[Unit] =
    for
      _ <- Sql.update(connection, createSchemaSql)
      _ <- Sql.update(connection, createUsersTableSql)
    yield ()
