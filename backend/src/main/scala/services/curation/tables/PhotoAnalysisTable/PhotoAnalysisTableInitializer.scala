package services.curation.tables

import java.sql.Connection

import cats.effect.IO

import services.system.db.Sql

/** curation.photo_analyses：照片情绪分析缓存表（analyzed_at 记录分析时间，model 记录产出模型）。 */
object PhotoAnalysisTableInitializer:
  private val createSchemaSql = "CREATE SCHEMA IF NOT EXISTS curation"

  private val createPhotoAnalysesTableSql =
    """CREATE TABLE IF NOT EXISTS curation.photo_analyses (
      |  photo_id uuid PRIMARY KEY,
      |  description text NOT NULL,
      |  mood text NOT NULL,
      |  palette jsonb NOT NULL,
      |  memory_cues jsonb NOT NULL,
      |  sensory text NOT NULL,
      |  suggested_caption text NOT NULL,
      |  model text NOT NULL,
      |  analyzed_at timestamptz NOT NULL
      |)""".stripMargin

  def initialize(connection: Connection): IO[Unit] =
    for
      _ <- Sql.update(connection, createSchemaSql)
      _ <- Sql.update(connection, createPhotoAnalysesTableSql)
    yield ()
