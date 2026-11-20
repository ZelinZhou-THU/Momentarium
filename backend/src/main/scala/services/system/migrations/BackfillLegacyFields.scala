package services.system.migrations

import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Path}
import java.time.Instant

import cats.effect.IO
import cats.effect.unsafe.implicits.global
import io.circe.Json
import org.slf4j.LoggerFactory

import services.scene.tables.SceneRunTableInitializer
import services.system.config.{AppConfig, DotEnv}
import services.system.db.{Database, Transaction}
import services.system.startup.Initializers

/**
 * 历史字段一次性回填（adoption 归属 + scene run kind）：
 *
 * - 由 scripts/db/backfill-legacy-fields.ps1 通过
 *   `sbt "runMain services.system.migrations.BackfillLegacyFields"` 调用；
 * - 不挂常规启动：启动只建表/补列与恢复中断运行，数据回填必须显式执行；
 * - 两个回填都是幂等 UPDATE，事务内执行；只更新旧值为默认/空的旧行，不覆盖已写入的 revise/restore 与显式归属；
 * - 完成标记与摘要写 DATA_DIR/migrations/backfill-legacy-fields.json（不新增系统表）；
 * - `Initializers.run` 会恢复上次进程遗留的活跃运行，应在停止写入的升级窗口执行。
 */
object BackfillLegacyFields:
  val MigrationName = "backfill-legacy-fields"

  private val logger = LoggerFactory.getLogger(getClass)
  private val MarkerDirectory = "migrations"

  /** 一次迁移的处理结果：两个回填各自影响的行数。 */
  final case class Report(adoptedOriginsUpdated: Int, runKindsUpdated: Int)

  /** 执行结果：处理摘要、完成标记路径与完成时间。 */
  final case class RunResult(report: Report, markerPath: Path, completedAt: Instant)

  def main(args: Array[String]): Unit =
    (for
      dotEnv <- DotEnv.load(Path.of(".env"))
      config <- IO.fromEither(AppConfig.load(dotEnv ++ sys.env).left.map(message => new IllegalStateException(message)))
      result <- run(config)
    yield result).attempt.unsafeRunSync() match
      case Right(_) => sys.exit(0)
      case Left(error) =>
        logger.error("历史字段回填执行失败", error)
        sys.exit(1)

  /** 打开连接池执行一次回填（生产入口与测试共用；库由 DB_URL 决定）。 */
  def run(config: AppConfig): IO[RunResult] =
    Database.resource(config.database).use(database => execute(database, config))

  /** 初始化表（幂等）→ 事务内回填 → 写标记 → 打印摘要。 */
  private[system] def execute(database: Database, config: AppConfig): IO[RunResult] =
    for
      _ <- Initializers.run(database)
      report <- database.use(connection => Transaction(connection)(backfill(connection)))
      completedAt <- IO.realTimeInstant
      markerPath = markerFile(config.dataDir)
      _ <- writeMarker(markerPath, report, completedAt)
      _ <- printSummary(report, markerPath)
    yield RunResult(report, markerPath, completedAt)

  /** 两个回填在同一事务内完成；任一步失败整体回滚，可修复后重跑。 */
  private[system] def backfill(connection: java.sql.Connection): IO[Report] =
    for
      adoptedOriginsUpdated <- AdoptedPhotoBackfill.backfill(connection)
      runKindsUpdated <- SceneRunTableInitializer.backfillRunKinds(connection)
    yield Report(adoptedOriginsUpdated, runKindsUpdated)

  private def markerFile(dataDirectory: Path): Path =
    dataDirectory.resolve(MarkerDirectory).resolve(s"$MigrationName.json")

  private def markerJson(report: Report, completedAt: Instant): Json =
    Json.obj(
      "migration" -> Json.fromString(MigrationName),
      "status" -> Json.fromString("completed"),
      "completedAt" -> Json.fromString(completedAt.toString),
      "summary" -> Json.obj(
        "adoptedOriginsUpdated" -> Json.fromInt(report.adoptedOriginsUpdated),
        "runKindsUpdated" -> Json.fromInt(report.runKindsUpdated)
      )
    )

  private def writeMarker(markerPath: Path, report: Report, completedAt: Instant): IO[Unit] =
    IO.blocking {
      Option(markerPath.getParent).foreach(parent => Files.createDirectories(parent))
      Files.writeString(markerPath, markerJson(report, completedAt).noSpaces + "\n", StandardCharsets.UTF_8)
      ()
    }

  private def printSummary(report: Report, markerPath: Path): IO[Unit] =
    IO.println(
      s"[$MigrationName] adopted_from_contribution_id 回填=${report.adoptedOriginsUpdated} 行；" +
        s"scene_runs.kind 回填=${report.runKindsUpdated} 行；完成标记：$markerPath"
    )
