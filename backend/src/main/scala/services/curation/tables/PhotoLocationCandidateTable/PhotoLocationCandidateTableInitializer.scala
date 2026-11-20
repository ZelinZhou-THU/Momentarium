package services.curation.tables

import java.sql.Connection

import cats.effect.IO

import services.system.db.Sql

/** curation.photo_location_candidates 建表与索引（阶段 3，api-contract v1.13）；幂等。
  * photo_id 指 gallery.exhibition_photos.id，但不设 FK（跨服务、初始化顺序解耦）；建议时按 photo_id 整体替换。 */
object PhotoLocationCandidateTableInitializer:
  private val createSchemaSql = "CREATE SCHEMA IF NOT EXISTS curation"

  private val createTableSql =
    """CREATE TABLE IF NOT EXISTS curation.photo_location_candidates (
      |  id uuid PRIMARY KEY,
      |  photo_id uuid NOT NULL,
      |  name text NOT NULL,
      |  latitude double precision NULL,
      |  longitude double precision NULL,
      |  granularity text NULL CHECK (granularity IS NULL OR granularity IN ('area', 'exact')),
      |  reason text NOT NULL,
      |  model text NOT NULL,
      |  generated_at timestamptz NOT NULL,
      |  CHECK ((latitude IS NULL) = (longitude IS NULL)),
      |  CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90)),
      |  CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180))
      |)""".stripMargin

  private val createPhotoIndexSql =
    "CREATE INDEX IF NOT EXISTS photo_location_candidates_photo_id_idx ON curation.photo_location_candidates (photo_id)"

  def initialize(connection: Connection): IO[Unit] =
    for
      _ <- Sql.update(connection, createSchemaSql)
      _ <- Sql.update(connection, createTableSql)
      _ <- Sql.update(connection, createPhotoIndexSql)
    yield ()
