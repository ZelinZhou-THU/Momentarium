package services.gallery.tables

import java.sql.Connection

import cats.effect.IO

import services.system.db.Sql

/** gallery.photo_locations 建表与约束初始化（api-contract v1.7 / midterm-plan §3.3）。幂等。 */
object PhotoLocationTableInitializer:
  private val createSchemaSql = "CREATE SCHEMA IF NOT EXISTS gallery"

  private val createTableSql =
    """CREATE TABLE IF NOT EXISTS gallery.photo_locations (
      |  photo_id uuid PRIMARY KEY REFERENCES gallery.exhibition_photos(id) ON DELETE CASCADE,
      |  source text NOT NULL CHECK (source IN ('exif', 'manual', 'ai')),
      |  status text NOT NULL CHECK (status IN ('suggested', 'confirmed')),
      |  name text NOT NULL DEFAULT '',
      |  latitude double precision NULL,
      |  longitude double precision NULL,
      |  granularity text NOT NULL DEFAULT 'hidden' CHECK (granularity IN ('hidden', 'area', 'exact')),
      |  updated_at timestamptz NOT NULL,
      |  CHECK ((latitude IS NULL) = (longitude IS NULL)),
      |  CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90)),
      |  CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180)),
      |  CHECK (status <> 'confirmed' OR granularity = 'hidden' OR (latitude IS NOT NULL AND longitude IS NOT NULL))
      |)""".stripMargin

  def initialize(connection: Connection): IO[Unit] =
    for
      _ <- Sql.update(connection, createSchemaSql)
      _ <- Sql.update(connection, createTableSql)
    yield ()
