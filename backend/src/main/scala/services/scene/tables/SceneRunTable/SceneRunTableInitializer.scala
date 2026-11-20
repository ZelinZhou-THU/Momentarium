package services.scene.tables

import java.sql.Connection

import cats.effect.IO

import services.system.db.Sql

/**
 * scene.scene_runs 建表与启动初始化：
 * - schema/表/索引幂等创建；部分唯一索引保证同一展览最多一个活跃运行；
 * - 启动时把上次进程遗留的活跃运行标记为 failed(SERVER_RESTARTED)（spec 6.6）。
 */
object SceneRunTableInitializer:
  private val createSchemaSql = "CREATE SCHEMA IF NOT EXISTS scene"

  private val createSceneRunsTableSql =
    """CREATE TABLE IF NOT EXISTS scene.scene_runs (
      |  id uuid PRIMARY KEY,
      |  exhibition_id uuid NOT NULL,
      |  requested_by uuid NOT NULL,
      |  status text NOT NULL,
      |  source text NULL,
      |  hint text NULL,
      |  photo_ids jsonb NOT NULL,
      |  curation_version int NOT NULL,
      |  runtime_version text NOT NULL,
      |  brief_json jsonb NULL,
      |  code text NULL,
      |  review_json jsonb NULL,
      |  runtime_json jsonb NULL,
      |  attempts int NOT NULL DEFAULT 0,
      |  prompt_version text NOT NULL,
      |  error_code text NULL,
      |  error_message text NULL,
      |  created_at timestamptz NOT NULL,
      |  updated_at timestamptz NOT NULL,
      |  restored_from uuid NULL,
      |  build_repairs int NOT NULL DEFAULT 0,
      |  kind text NOT NULL DEFAULT 'generate',
      |  parent_run_id uuid NULL,
      |  revision_instruction text NULL,
      |  dismissed boolean NOT NULL DEFAULT false
      |)""".stripMargin

  private val createExhibitionIndexSql =
    "CREATE INDEX IF NOT EXISTS scene_runs_exhibition_created_idx ON scene.scene_runs (exhibition_id, created_at DESC)"

  private val createSingleActiveIndexSql =
    """CREATE UNIQUE INDEX IF NOT EXISTS scene_runs_single_active_idx ON scene.scene_runs (exhibition_id)
      |WHERE status IN ('queued', 'generating', 'awaiting_capture', 'reviewing')""".stripMargin

  /** 版本历史：恢复旧版本时记录最初来源（无迁移工具，幂等补列）。 */
  private val addRestoredFromColumnSql =
    "ALTER TABLE scene.scene_runs ADD COLUMN IF NOT EXISTS restored_from uuid NULL"

  /** 构建阶段崩溃的独立修复计数（与 attempts 的质量修订分开计）。 */
  private val addBuildRepairsColumnSql =
    "ALTER TABLE scene.scene_runs ADD COLUMN IF NOT EXISTS build_repairs int NOT NULL DEFAULT 0"

  /** 阶段 4（v1.14）：运行起因 generate/revise/restore，与 source 产物来源独立；旧行默认 generate。 */
  private val addKindColumnSql =
    "ALTER TABLE scene.scene_runs ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'generate'"

  /** 阶段 4（v1.14）：用户修订的直接父运行与原始指令（与生成 hint 分开）。 */
  private val addParentRunIdColumnSql =
    "ALTER TABLE scene.scene_runs ADD COLUMN IF NOT EXISTS parent_run_id uuid NULL"

  private val addRevisionInstructionColumnSql =
    "ALTER TABLE scene.scene_runs ADD COLUMN IF NOT EXISTS revision_instruction text NULL"

  private val addDismissedColumnSql =
    "ALTER TABLE scene.scene_runs ADD COLUMN IF NOT EXISTS dismissed boolean NOT NULL DEFAULT false"

  /**
   * kind 存量回填（spec §7）：旧行 restored_from 非空→restore，其余保持默认 generate。
   * 只更新仍为 generate 的行，幂等重跑不会覆盖已写入的 revise/restore。
   * 一次性迁移专用（BackfillLegacyFields），不挂常规启动。
   */
  private val backfillRunKindsSql =
    "UPDATE scene.scene_runs SET kind = 'restore' WHERE restored_from IS NOT NULL AND kind = 'generate'"

  /** 返回受影响行数；一次性迁移专用，不挂常规启动。 */
  def backfillRunKinds(connection: Connection): IO[Int] =
    Sql.update(connection, backfillRunKindsSql)

  def initialize(connection: Connection): IO[Unit] =
    for
      _ <- Sql.update(connection, createSchemaSql)
      _ <- Sql.update(connection, createSceneRunsTableSql)
      _ <- Sql.update(connection, createExhibitionIndexSql)
      _ <- Sql.update(connection, createSingleActiveIndexSql)
      _ <- Sql.update(connection, addRestoredFromColumnSql)
      _ <- Sql.update(connection, addBuildRepairsColumnSql)
      _ <- Sql.update(connection, addKindColumnSql)
      _ <- Sql.update(connection, addParentRunIdColumnSql)
      _ <- Sql.update(connection, addRevisionInstructionColumnSql)
      _ <- Sql.update(connection, addDismissedColumnSql)
      now <- IO.realTimeInstant
      _ <- SceneRunTable.recoverInterruptedRuns(connection, now)
    yield ()
