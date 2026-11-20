package services.system.migrations

import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Path}
import java.time.Instant

import cats.effect.IO
import cats.effect.unsafe.implicits.global
import cats.syntax.all.*
import io.circe.Json
import io.circe.syntax.*
import org.slf4j.LoggerFactory

import services.gallery.tables.ExhibitionTable
import services.scene.objects.SceneRunStatus
import services.scene.tables.SceneRunTable
import services.system.config.{AppConfig, DotEnv}
import services.system.db.Database
import services.system.startup.Initializers

/**
 * 阶段 4（v1.14）历史展览 `gallery.exhibitions.current_scene_run_id` 指针的一次性 JVM 迁移入口。
 *
 * - 由 scripts/db/backfill-current-scene-run-ids.ps1 通过
 *   `sbt "runMain services.system.migrations.BackfillCurrentSceneRunIds"` 调用；
 * - 在停止写入的升级窗口执行：逐展览读取，只填空指针，按原有排序取最新一次 succeeded 运行
 *   （SceneRunTable.findLatestSucceeded：created_at DESC, id DESC）并核对所属展览与状态；无成功运行保留空；
 * - 不覆盖已设置的指针（AND current_scene_run_id IS NULL），失败可重跑；不刷新展览 updated_at；
 * - 完成标记/摘要写 DATA_DIR/migrations/backfill-current-scene-run-ids.json（不新增系统表）；
 * - 不挂常规启动、不做运行期“空指针取最新成功”兜底。
 */
object BackfillCurrentSceneRunIds:
  val MigrationName = "backfill-current-scene-run-ids"

  private val logger = LoggerFactory.getLogger(getClass)
  private val MarkerDirectory = "migrations"

  /** 一次迁移执行结果：处理摘要、完成标记路径与完成时间。 */
  final case class RunResult(report: CurrentSceneRunBackfillReport, markerPath: Path, completedAt: Instant)

  def main(args: Array[String]): Unit =
    (for
      dotEnv <- DotEnv.load(Path.of(".env"))
      config <- IO.fromEither(AppConfig.load(dotEnv ++ sys.env).left.map(message => new IllegalStateException(message)))
      result <- run(config)
    yield result).attempt.unsafeRunSync() match
      case Right(result) =>
        if result.report.failures.nonEmpty then sys.exit(1) else sys.exit(0)
      case Left(error) =>
        logger.error("当前场景指针回填执行失败", error)
        sys.exit(1)

  /** 打开连接池执行一次回填（生产入口与测试共用；库由 DB_URL 决定）。 */
  def run(config: AppConfig): IO[RunResult] =
    Database.resource(config.database).use(database => execute(database, config))

  /** 初始化表（幂等，应用新列/kind 回填）→ 指针回填 → 写标记 → 打印摘要。 */
  private[system] def execute(database: Database, config: AppConfig): IO[RunResult] =
    for
      _ <- Initializers.run(database)
      report <- database.use(connection => backfill(connection))
      completedAt <- IO.realTimeInstant
      markerPath = markerFile(config.dataDir)
      _ <- writeMarker(markerPath, report, completedAt)
      _ <- printSummary(report, markerPath)
    yield RunResult(report, markerPath, completedAt)

  /**
   * 指针回填主体：只填空指针、不覆盖；单个展览失败只记录失败项并继续（便于修复后重跑）。
   * 每个指针写入都是一次原子 UPDATE（WHERE ... IS NULL），无需跨步骤长事务。
   */
  private[system] def backfill(connection: java.sql.Connection): IO[CurrentSceneRunBackfillReport] =
    ExhibitionTable.listAll(connection).flatMap { exhibitions =>
      exhibitions.foldLeftM(CurrentSceneRunBackfillReport.empty) { (report, exhibition) =>
        val scanned = report.copy(exhibitionsTotal = report.exhibitionsTotal + 1)
        if exhibition.currentSceneRunId.isDefined then
          IO.pure(scanned.copy(pointersSkippedExisting = scanned.pointersSkippedExisting + 1))
        else
          SceneRunTable
            .findLatestSucceeded(connection, exhibition.id)
            .flatMap {
              case Some(run) if run.exhibitionId == exhibition.id && run.status == SceneRunStatus.Succeeded =>
                ExhibitionTable
                  .fillCurrentSceneRunIfMissing(connection, exhibition.id, run.id)
                  .map(updated =>
                    if updated == 1 then scanned.copy(pointersFilled = scanned.pointersFilled + 1)
                    else scanned.copy(pointersSkippedExisting = scanned.pointersSkippedExisting + 1)
                  )
              case _ =>
                IO.pure(scanned.copy(exhibitionsWithoutSucceededRun = scanned.exhibitionsWithoutSucceededRun + 1))
            }
            .handleErrorWith(error =>
              IO(
                logger.warn(s"展览指针回填失败（继续处理其余展览）：exhibitionId=${exhibition.id.value}，原因：${describe(error)}")
              ).as(
                scanned.copy(failures =
                  scanned.failures :+ CurrentSceneRunBackfillFailure(exhibition.id, describe(error))
                )
              )
            )
      }
    }

  private def markerFile(dataDirectory: Path): Path =
    dataDirectory.resolve(MarkerDirectory).resolve(s"$MigrationName.json")

  private def markerJson(report: CurrentSceneRunBackfillReport, completedAt: Instant): Json =
    Json.obj(
      "migration" -> Json.fromString(MigrationName),
      "status" -> Json.fromString(if report.failures.nonEmpty then "partial" else "completed"),
      "completedAt" -> Json.fromString(completedAt.toString),
      "summary" -> report.asJson
    )

  private def writeMarker(markerPath: Path, report: CurrentSceneRunBackfillReport, completedAt: Instant): IO[Unit] =
    IO.blocking {
      Option(markerPath.getParent).foreach(parent => Files.createDirectories(parent))
      Files.writeString(markerPath, markerJson(report, completedAt).noSpaces + "\n", StandardCharsets.UTF_8)
      ()
    }

  private def printSummary(report: CurrentSceneRunBackfillReport, markerPath: Path): IO[Unit] =
    IO.println(
      s"[$MigrationName] 展览：总数=${report.exhibitionsTotal} 回填=${report.pointersFilled} " +
        s"已有指针跳过=${report.pointersSkippedExisting} 无成功运行=${report.exhibitionsWithoutSucceededRun} " +
        s"失败=${report.failures.size}"
    ) *>
      report.failures.traverse_(failure =>
        IO.println(s"[$MigrationName] 失败 exhibitionId=${failure.exhibitionId.value}：${failure.reason}")
      ) *>
      IO.println(s"[$MigrationName] 完成标记：$markerPath")

  private def describe(error: Throwable): String =
    Option(error.getMessage).filter(_.nonEmpty).getOrElse(error.getClass.getSimpleName)
