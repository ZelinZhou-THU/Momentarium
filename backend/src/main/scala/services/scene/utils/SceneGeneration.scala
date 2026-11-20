package services.scene.utils

import java.sql.Connection

import cats.effect.IO
import cats.syntax.all.*
import org.slf4j.LoggerFactory

import services.curation.objects.PhotoAnalysis
import services.curation.tables.PhotoAnalysisTable
import services.gallery.objects.PhotoId
import services.gallery.tables.ExhibitionTable
import services.scene.objects.{SceneBrief, SceneRun, SceneRunId, SceneRunStatus, SceneSource}
import services.scene.tables.SceneRunTable
import services.scene.utils.prompts.{SceneBriefPrompts, SceneCodePrompts}
import services.system.ai.AiPorts
import services.system.ai.AiRuntime
import services.system.config.AppConfig
import services.system.db.Database
import services.system.startup.AppRuntime

/**
 * 生成链路（spec 9.6）：Queued → Generating →（父智能体题面 → 子智能体代码 → 清洗）→ AwaitingCapture。
 * 题面或代码生成失败时置 Failed(GENERATION_FAILED) 并写明原因，由用户重新生成（2026-11-01 用户决定）：
 * 通用兜底题面与这组照片无关，用它做出的场景只会误导，因此生成与修复阶段都不再改用兜底。
 * 兜底场景只在评审修订额度用尽时作为最终结果（SceneReviewFlow），那时保留的仍是 AI 按照片写的题面。
 * 本流程在脱离请求的 fiber 内执行：自己从 AppRuntime 取 Database，使用独立连接。
 */
private[scene] object SceneGeneration:

  private val logger = LoggerFactory.getLogger(getClass)
  private val FailedCode = "GENERATION_FAILED"

  /** 供 generatescene 起 fiber 调用；端口从 AiRuntime 取，内部处理所有错误，不把异常抛回请求。 */
  def run(database: Database, runId: SceneRunId): IO[Unit] =
    AiRuntime.ports.flatMap(ports => runWith(database, ports, runId))

  /** 可注入 AI 端口的执行入口（测试用：注入失败端口验证兜底路径）。 */
  def runWith(database: Database, ports: AiPorts, runId: SceneRunId): IO[Unit] =
    database
      .use(connection => generate(connection, ports, runId))
      .handleErrorWith(error =>
        IO(logger.error(s"场景生成流程异常（runId=${runId.value}）：${describe(error)}")) *>
          database.use(connection => markFailed(connection, runId, error))
      )

  private def generate(connection: Connection, ports: AiPorts, runId: SceneRunId): IO[Unit] =
    SceneRunTable.findById(connection, runId).flatMap {
      case None => IO(logger.error(s"场景生成找不到运行：runId=${runId.value}"))
      case Some(run) =>
        for
          now <- CurrentTime.now
          marked <- SceneRunTable.markGenerating(connection, run.id, now)
          _ <-
            if marked == 0 then IO(logger.warn(s"运行已不在 queued 状态，跳过生成：runId=${run.id.value}"))
            else generateContent(connection, ports, run)
        yield ()
    }

  private def generateContent(connection: Connection, ports: AiPorts, run: SceneRun): IO[Unit] =
    for
      config <- AppRuntime.config
      exhibition <- ExhibitionTable.findById(connection, run.exhibitionId).flatMap {
                      case Some(found) => IO.pure(found)
                      case None => IO.raiseError(new IllegalStateException("展览不存在，无法生成场景"))
                    }
      state <- SceneState.load(connection, exhibition)
      analyses <- loadAnalyses(connection, run.photoIds)
      content <- generateAi(connection, ports, config, run, state, analyses).attempt
      now <- CurrentTime.now
      _ <- content match
             case Right((brief, code)) =>
               SceneRunTable
                 .markAwaitingCapture(connection, run.id, SceneSource.Ai, brief, code, now)
                 .void
             case Left(error) =>
               IO(logger.warn(s"AI 生成失败，运行置为失败等待重试：runId=${run.id.value}，原因：${describe(error)}")) *>
                 markFailed(connection, run.id, error)
    yield ()

  /** 供 reviewscene 修订后重新生成；端口从 AiRuntime 取，内部处理所有错误。 */
  def revise(database: Database, runId: SceneRunId, issues: List[String]): IO[Unit] =
    AiRuntime.ports.flatMap(ports => reviseWith(database, ports, runId, issues))

  /** 可注入 AI 端口的修复入口（测试用：验证修订后的重新生成与失败路径）。 */
  def reviseWith(database: Database, ports: AiPorts, runId: SceneRunId, issues: List[String]): IO[Unit] =
    database
      .use(connection => repair(connection, ports, runId, issues))
      .handleErrorWith(error =>
        IO(logger.error(s"场景修复流程异常（runId=${runId.value}）：${describe(error)}")) *>
          database.use(connection => markFailed(connection, runId, error))
      )

  private def repair(connection: Connection, ports: AiPorts, runId: SceneRunId, issues: List[String]): IO[Unit] =
    SceneRunTable.findById(connection, runId).flatMap {
      case None => IO(logger.error(s"场景修复找不到运行：runId=${runId.value}"))
      case Some(run) if run.status != SceneRunStatus.Generating =>
        IO(logger.warn(s"运行已不在 generating 状态，跳过修复：runId=${run.id.value}，状态：${SceneRunStatus.toString(run.status)}"))
      case Some(run) => repairContent(connection, ports, run, issues)
    }

  private def repairContent(
    connection: Connection,
    ports: AiPorts,
    run: SceneRun,
    issues: List[String]
  ): IO[Unit] =
    for
      config <- AppRuntime.config
      exhibition <- ExhibitionTable.findById(connection, run.exhibitionId).flatMap {
                      case Some(found) => IO.pure(found)
                      case None => IO.raiseError(new IllegalStateException("展览不存在，无法修复场景"))
                    }
      state <- SceneState.load(connection, exhibition)
      // reviewing 状态的运行必经 markAwaitingCapture 写入题面；brief 为空只可能是库被手工改动。
      repaired <- run.brief match
                    case Some(brief) => repairAi(ports, config, run, brief, state, issues).attempt.map(_.map(code => (brief, code)))
                    case None => IO.pure(Left(new IllegalStateException("运行缺少题面，无法修复")))
      now <- CurrentTime.now
      _ <- repaired match
             case Right((brief, code)) =>
               SceneRunTable.markAwaitingCapture(connection, run.id, SceneSource.Ai, brief, code, now).void
             case Left(error) =>
               IO(logger.warn(s"AI 修复失败，运行置为失败等待重试：runId=${run.id.value}，原因：${describe(error)}")) *>
                 markFailed(connection, run.id, error)
    yield ()

  private def repairAi(
    ports: AiPorts,
    config: AppConfig,
    run: SceneRun,
    brief: SceneBrief,
    state: SceneState,
    issues: List[String]
  ): IO[String] =
    val sessionId = run.id.value.toString
    IO(
      logger.info(s"场景修复重生成开始：runId=${run.id.value}，promptVersion=${SceneCodePrompts.RepairVersion}，attempts=${run.attempts}")
    ) *>
      ports.text
        .complete(
          SceneCodePrompts.repairSceneCode(sessionId, brief, state, run.code.getOrElse(""), issues, config.scene.codeLimitKb)
        )
        .flatMap(rawCode =>
          IO.fromEither(
            CodeSanitizer
              .sanitize(rawCode, config.scene.codeLimitKb)
              .left
              .map(reason => new IllegalStateException(s"修复代码未通过基础校验：$reason"))
          )
        )

  private def generateAi(
    connection: Connection,
    ports: AiPorts,
    config: AppConfig,
    run: SceneRun,
    state: SceneState,
    analyses: Map[PhotoId, PhotoAnalysis]
  ): IO[(SceneBrief, String)] =
    val sessionId = run.id.value.toString
    for
      _ <- IO(
             logger.info(
               s"场景生成开始：runId=${run.id.value}，promptVersion=${SceneCodePrompts.Version}（父题面 + 子代码共用）"
             )
           )
      brief <- writeValidBrief(ports, config, run, state, analyses)
      _ <- saveBriefForProgress(connection, run.id, brief)
      rawCode <- ports.text.complete(
                   SceneCodePrompts.generateSceneCode(sessionId, brief, state, config.scene.codeLimitKb)
                 )
      code <- IO.fromEither(
                CodeSanitizer
                  .sanitize(rawCode, config.scene.codeLimitKb)
                  .left
                  .map(reason => new IllegalStateException(s"模型代码未通过基础校验：$reason"))
              )
    yield (brief, code)

  /**
   * 父题面 + 语义校验（BriefValidation）：不合规时带着问题重写一次；重写后仍有问题则记录告警并继续用重写版
   * （只要 scenePrompt 非空，后续评审环还能兜住质量，不为措辞细节直接放弃 AI 生成）。
   * userHint 由服务端回填为用户原文，不信模型改写。
   */
  private def writeValidBrief(
    ports: AiPorts,
    config: AppConfig,
    run: SceneRun,
    state: SceneState,
    analyses: Map[PhotoId, PhotoAnalysis]
  ): IO[SceneBrief] =
    val sessionId = run.id.value.toString
    val limitKb = config.scene.codeLimitKb
    ports.text
      .structured[SceneBrief](SceneBriefPrompts.writeBrief(sessionId, state, analyses, run.hint, limitKb))
      .flatMap(first =>
        BriefValidation.validate(first) match
          case Nil => IO.pure(first)
          case issues =>
            IO(logger.warn(s"父题面未通过校验，带原因重写一次：runId=${run.id.value}，问题：${issues.mkString("；")}")) *>
              ports.text
                .structured[SceneBrief](SceneBriefPrompts.rewriteBrief(sessionId, state, analyses, run.hint, limitKb, issues))
                .flatTap(second =>
                  BriefValidation.validate(second) match
                    case Nil => IO.unit
                    case remaining =>
                      IO(logger.warn(s"重写后的题面仍有问题，继续生成：runId=${run.id.value}，问题：${remaining.mkString("；")}"))
                )
      )
      .flatMap(brief =>
        if brief.scenePrompt.trim.isEmpty then IO.raiseError(new IllegalStateException("父题面 scenePrompt 为空"))
        else IO.pure(brief.copy(userHint = run.hint))
      )

  /**
   * 题面先落库（代码可能还要等好几分钟）：前端据此显示"正在写场景代码"而不是一直停在"正在生成题面"。
   * 只是进度信息，写失败只记日志、不打断生成；最终仍由 markAwaitingCapture 写入题面与代码。
   */
  private def saveBriefForProgress(connection: Connection, runId: SceneRunId, brief: SceneBrief): IO[Unit] =
    CurrentTime.now
      .flatMap(now => SceneRunTable.saveBrief(connection, runId, brief, now))
      .void
      .handleErrorWith(error => IO(logger.warn(s"题面进度落库失败（不影响生成）：runId=${runId.value}，原因：${describe(error)}")))

  private def markFailed(connection: Connection, runId: SceneRunId, error: Throwable): IO[Unit] =
    CurrentTime.now.flatMap(now =>
      SceneRunTable
        .markFailed(connection, runId, FailedCode, s"场景生成失败：${describe(error)}。请重新生成。", now)
        .void
    )

  private def loadAnalyses(connection: Connection, photoIds: List[PhotoId]): IO[Map[PhotoId, PhotoAnalysis]] =
    PhotoAnalysisTable.findByIds(connection, photoIds).map(records => records.map(record => record.photoId -> record.analysis).toMap)

  private def describe(error: Throwable): String =
    Option(error.getMessage).filter(_.nonEmpty).getOrElse(error.getClass.getSimpleName)
