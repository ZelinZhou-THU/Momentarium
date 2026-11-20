package services.gallery.tables

import java.sql.Connection

import cats.effect.IO

import services.system.db.Sql

/** gallery.exhibition_contributors 建表与索引初始化（api-contract v1.9 / midterm-plan §2）；幂等。 */
object ExhibitionContributorTableInitializer:
  private val createSchemaSql = "CREATE SCHEMA IF NOT EXISTS gallery"

  private val createTableSql =
    """CREATE TABLE IF NOT EXISTS gallery.exhibition_contributors (
      |  exhibition_id uuid NOT NULL REFERENCES gallery.exhibitions(id) ON DELETE CASCADE,
      |  user_id uuid NOT NULL,
      |  invite_id uuid NULL REFERENCES gallery.contribution_invites(id) ON DELETE SET NULL,
      |  status text NOT NULL CHECK (status IN ('active', 'revoked')),
      |  joined_at timestamptz NOT NULL,
      |  revoked_at timestamptz NULL,
      |  updated_at timestamptz NOT NULL,
      |  PRIMARY KEY (exhibition_id, user_id)
      |)""".stripMargin

  private val createUserIndexSql =
    "CREATE INDEX IF NOT EXISTS exhibition_contributors_user_id_idx ON gallery.exhibition_contributors (user_id)"

  def initialize(connection: Connection): IO[Unit] =
    for
      _ <- Sql.update(connection, createSchemaSql)
      _ <- Sql.update(connection, createTableSql)
      _ <- Sql.update(connection, createUserIndexSql)
    yield ()
