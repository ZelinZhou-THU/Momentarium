package services.gallery.tables

import java.sql.Connection

import cats.effect.IO

import services.system.db.Sql

/** gallery.publications 建表与索引初始化（spec §7）。 */
object PublicationTableInitializer:
  private val createSchemaSql = "CREATE SCHEMA IF NOT EXISTS gallery"

  private val createPublicationsTableSql =
    """CREATE TABLE IF NOT EXISTS gallery.publications (
      |  id uuid PRIMARY KEY,
      |  exhibition_id uuid NOT NULL REFERENCES gallery.exhibitions(id) ON DELETE CASCADE,
      |  version int NOT NULL,
      |  snapshot_json jsonb NOT NULL,
      |  status text NOT NULL,
      |  created_at timestamptz NOT NULL,
      |  superseded_at timestamptz NULL,
      |  CONSTRAINT publications_exhibition_version_key UNIQUE (exhibition_id, version)
      |)""".stripMargin

  private val createActiveUniqueIndexSql =
    """CREATE UNIQUE INDEX IF NOT EXISTS publications_single_active_idx
      |ON gallery.publications (exhibition_id) WHERE status = 'active'""".stripMargin

  private val createExhibitionIndexSql =
    "CREATE INDEX IF NOT EXISTS publications_exhibition_id_idx ON gallery.publications (exhibition_id)"

  def initialize(connection: Connection): IO[Unit] =
    for
      _ <- Sql.update(connection, createSchemaSql)
      _ <- Sql.update(connection, createPublicationsTableSql)
      _ <- Sql.update(connection, createActiveUniqueIndexSql)
      _ <- Sql.update(connection, createExhibitionIndexSql)
    yield ()
