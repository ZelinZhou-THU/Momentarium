package services.gallery.tables

import java.sql.Connection

import cats.effect.IO
import cats.syntax.all.*

import services.system.db.Sql

/** gallery.contributions 建表、索引与阶段 2.5/2.6 迁移（api-contract v1.11 / midterm-plan §2）；全部幂等。
  *
  * 阶段 2.5：照片可选——图片列改可空；新增 declined_at；status CHECK 加入 declined。
  * 阶段 2.6：新增投稿者建议图注 suggested_caption（可空；采用新照片时可作为默认图注）。
  * 旧库通过 ALTER 原地升级，保留既有照片投稿数据；新库直接按新形状建表后再跑同一组 ALTER（幂等）。 */
object ContributionTableInitializer:
  private val createSchemaSql = "CREATE SCHEMA IF NOT EXISTS gallery"

  private val createTableSql =
    """CREATE TABLE IF NOT EXISTS gallery.contributions (
      |  id uuid PRIMARY KEY,
      |  exhibition_id uuid NOT NULL REFERENCES gallery.exhibitions(id) ON DELETE CASCADE,
      |  contributor_id uuid NOT NULL,
      |  status text NOT NULL CHECK (status IN ('draft', 'submitted', 'declined', 'withdrawn')),
      |  version int NOT NULL CHECK (version >= 1),
      |  memory_text text NOT NULL DEFAULT '',
      |  suggested_caption text NULL,
      |  original_name text NULL,
      |  mime text NULL,
      |  width int NULL,
      |  height int NULL,
      |  original_key text NULL,
      |  thumb_key text NULL,
      |  display_key text NULL,
      |  original_bytes bigint NULL CHECK (original_bytes IS NULL OR original_bytes >= 0),
      |  derived_bytes bigint NULL CHECK (derived_bytes IS NULL OR derived_bytes >= 0),
      |  location_name text NOT NULL DEFAULT '',
      |  latitude double precision NULL,
      |  longitude double precision NULL,
      |  location_source text NOT NULL DEFAULT 'manual' CHECK (location_source IN ('exif', 'manual')),
      |  created_at timestamptz NOT NULL,
      |  updated_at timestamptz NOT NULL,
      |  withdrawn_at timestamptz NULL,
      |  declined_at timestamptz NULL,
      |  CHECK ((latitude IS NULL) = (longitude IS NULL)),
      |  CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90)),
      |  CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180))
      |)""".stripMargin

  private val createExhibitionStatusIndexSql =
    """CREATE INDEX IF NOT EXISTS contributions_exhibition_status_idx
      |ON gallery.contributions (exhibition_id, status)""".stripMargin

  private val createContributorExhibitionIndexSql =
    """CREATE INDEX IF NOT EXISTS contributions_contributor_exhibition_idx
      |ON gallery.contributions (contributor_id, exhibition_id)""".stripMargin

  /** 旧库升级：图片列 DROP NOT NULL、补 declined_at/suggested_caption、重建 status CHECK（旧 CHECK 只允许三态）。 */
  private val migrationSql: List[String] =
    List(
      "ALTER TABLE gallery.contributions ADD COLUMN IF NOT EXISTS declined_at timestamptz NULL",
      "ALTER TABLE gallery.contributions ADD COLUMN IF NOT EXISTS suggested_caption text NULL",
      "ALTER TABLE gallery.contributions ALTER COLUMN original_name DROP NOT NULL",
      "ALTER TABLE gallery.contributions ALTER COLUMN mime DROP NOT NULL",
      "ALTER TABLE gallery.contributions ALTER COLUMN original_key DROP NOT NULL",
      "ALTER TABLE gallery.contributions ALTER COLUMN thumb_key DROP NOT NULL",
      "ALTER TABLE gallery.contributions ALTER COLUMN display_key DROP NOT NULL",
      "ALTER TABLE gallery.contributions ALTER COLUMN original_bytes DROP NOT NULL",
      "ALTER TABLE gallery.contributions ALTER COLUMN derived_bytes DROP NOT NULL",
      "ALTER TABLE gallery.contributions DROP CONSTRAINT IF EXISTS contributions_status_check",
      """ALTER TABLE gallery.contributions ADD CONSTRAINT contributions_status_check
        |CHECK (status IN ('draft', 'submitted', 'declined', 'withdrawn'))""".stripMargin
    )

  def initialize(connection: Connection): IO[Unit] =
    for
      _ <- Sql.update(connection, createSchemaSql)
      _ <- Sql.update(connection, createTableSql)
      _ <- Sql.update(connection, createExhibitionStatusIndexSql)
      _ <- Sql.update(connection, createContributorExhibitionIndexSql)
      _ <- migrationSql.traverse_(sql => Sql.update(connection, sql))
    yield ()
