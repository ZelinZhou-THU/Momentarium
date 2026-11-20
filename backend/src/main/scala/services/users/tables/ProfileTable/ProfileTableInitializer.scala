package services.users.tables

import java.sql.Connection

import cats.effect.IO

import services.system.db.Sql

/** users.profiles 建表：与 users.users 一对一，删除账户时级联删除。 */
object ProfileTableInitializer:
  private val createSchemaSql = "CREATE SCHEMA IF NOT EXISTS users"

  private val createProfilesTableSql =
    """CREATE TABLE IF NOT EXISTS users.profiles (
      |  user_id uuid PRIMARY KEY REFERENCES users.users(id) ON DELETE CASCADE,
      |  display_name text NOT NULL,
      |  bio text NOT NULL,
      |  homepage_public boolean NOT NULL,
      |  updated_at timestamptz NOT NULL
      |)""".stripMargin

  def initialize(connection: Connection): IO[Unit] =
    for
      _ <- Sql.update(connection, createSchemaSql)
      _ <- Sql.update(connection, createProfilesTableSql)
    yield ()
