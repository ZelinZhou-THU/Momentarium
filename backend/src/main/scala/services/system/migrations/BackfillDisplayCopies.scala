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

import services.gallery.api.BackfillDisplayCopiesMessage
import services.gallery.objects.apiTypes.DisplayCopyBackfillReport
import services.system.config.{AppConfig, DotEnv}
import services.system.db.Database
import services.system.startup.Initializers

/** P0-B2 历史展示副本回填的独立 JVM 迁移入口（system/migrations 目录只放一次性迁移，不挂常规启动流程）。
  *
  * 由 scripts/db/backfill-display-copies.ps1 通过 `sbt "runMain services.system.migrations.BackfillDisplayCopies"` 调用；
  * 业务编排在 gallery 的 BackfillDisplayCopiesMessage，本对象只负责读取配置、打开连接、打印摘要与写完成标记。
  * 完成标记为 DATA_DIR/migrations/backfill-display-copies.json（不新增系统表）；重复执行按展示副本存在性跳过，可安全重跑。
  */
object BackfillDisplayCopies:
  val MigrationName = "backfill-display-copies"

  private val logger = LoggerFactory.getLogger(getClass)
  private val MarkerDirectory = "migrations"

  /** 一次迁移执行结果：处理摘要、完成标记路径与完成时间。 */
  final case class RunResult(report: DisplayCopyBackfillReport, markerPath: Path, completedAt: Instant)

  def main(args: Array[String]): Unit =
    (for
      dotEnv <- DotEnv.load(Path.of(".env"))
      config <- IO.fromEither(AppConfig.load(dotEnv ++ sys.env).left.map(message => new IllegalStateException(message)))
      result <- run(config)
    yield result).attempt.unsafeRunSync() match
      case Right(result) =>
        if hasFailures(result.report) then sys.exit(1) else sys.exit(0)
      case Left(error) =>
        logger.error("历史展示副本回填执行失败", error)
        sys.exit(1)

  /** 打开连接池执行一次回填（生产入口与测试共用；不会操作真实库，库由 DB_URL 决定）。 */
  def run(config: AppConfig): IO[RunResult] =
    Database.resource(config.database).use(database => execute(database, config))

  /** 在已打开的数据库/已加载配置上执行：初始化表（幂等）→ 回填 → 写标记 → 打印摘要。 */
  private[system] def execute(database: Database, config: AppConfig): IO[RunResult] =
    for
      _ <- Initializers.run(database)
      report <- database.use(connection => BackfillDisplayCopiesMessage(config.dataDir).plan(connection))
      completedAt <- IO.realTimeInstant
      markerPath = markerFile(config.dataDir)
      _ <- writeMarker(markerPath, report, completedAt)
      _ <- printSummary(report, markerPath)
    yield RunResult(report, markerPath, completedAt)

  private def markerFile(dataDirectory: Path): Path =
    dataDirectory.resolve(MarkerDirectory).resolve(s"$MigrationName.json")

  private def hasFailures(report: DisplayCopyBackfillReport): Boolean =
    report.photoFailures.nonEmpty || report.renderFailures.nonEmpty

  private def markerJson(report: DisplayCopyBackfillReport, completedAt: Instant): Json =
    Json.obj(
      "migration" -> Json.fromString(MigrationName),
      "status" -> Json.fromString(if hasFailures(report) then "partial" else "completed"),
      "completedAt" -> Json.fromString(completedAt.toString),
      "summary" -> report.asJson
    )

  private def writeMarker(markerPath: Path, report: DisplayCopyBackfillReport, completedAt: Instant): IO[Unit] =
    IO.blocking {
      Option(markerPath.getParent).foreach(parent => Files.createDirectories(parent))
      Files.writeString(markerPath, markerJson(report, completedAt).noSpaces + "\n", StandardCharsets.UTF_8)
      ()
    }

  private def printSummary(report: DisplayCopyBackfillReport, markerPath: Path): IO[Unit] =
    IO.println(
      s"[$MigrationName] 照片：总数=${report.photosTotal} 生成=${report.photosGenerated} 跳过=${report.photosSkipped} 失败=${report.photoFailures.size}"
    ) *>
      IO.println(
        s"[$MigrationName] render 封面：总数=${report.rendersTotal} 重编码=${report.rendersReencoded} 跳过=${report.rendersSkipped} 失败=${report.renderFailures.size}"
      ) *>
      report.photoFailures.traverse_(failure =>
        IO.println(s"[$MigrationName] 照片失败 photoId=${failure.subject}：${failure.reason}")
      ) *>
      report.renderFailures.traverse_(failure =>
        IO.println(s"[$MigrationName] 封面失败 file=${failure.subject}：${failure.reason}")
      ) *>
      IO.println(s"[$MigrationName] 完成标记：$markerPath")
