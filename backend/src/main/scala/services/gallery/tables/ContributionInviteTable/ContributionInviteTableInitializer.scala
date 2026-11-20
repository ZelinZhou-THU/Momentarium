package services.gallery.tables

import java.sql.Connection

import cats.effect.IO

import services.system.db.Sql

/** gallery.contribution_invites 建表与索引初始化（api-contract v1.9 / midterm-plan §2）；幂等。 */
object ContributionInviteTableInitializer:
  private val createSchemaSql = "CREATE SCHEMA IF NOT EXISTS gallery"

  private val createTableSql =
    """CREATE TABLE IF NOT EXISTS gallery.contribution_invites (
      |  id uuid PRIMARY KEY,
      |  exhibition_id uuid NOT NULL REFERENCES gallery.exhibitions(id) ON DELETE CASCADE,
      |  token_hash text NOT NULL UNIQUE,
      |  status text NOT NULL CHECK (status IN ('active', 'closed')),
      |  created_by uuid NOT NULL,
      |  created_at timestamptz NOT NULL,
      |  closed_at timestamptz NULL
      |)""".stripMargin

  private val createExhibitionIndexSql =
    "CREATE INDEX IF NOT EXISTS contribution_invites_exhibition_id_idx ON gallery.contribution_invites (exhibition_id)"

  def initialize(connection: Connection): IO[Unit] =
    for
      _ <- Sql.update(connection, createSchemaSql)
      _ <- Sql.update(connection, createTableSql)
      _ <- Sql.update(connection, createExhibitionIndexSql)
    yield ()
