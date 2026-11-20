package services.scene.utils

import java.sql.Connection
import java.time.Instant

import cats.effect.IO
import org.slf4j.LoggerFactory

import services.gallery.objects.PhotoId
import services.gallery.tables.ExhibitionTable
import services.scene.objects.{SceneReview, SceneRun, SceneRunId, SceneRunKind}
import services.scene.objects.apiTypes.RuntimeEvidence
import services.scene.tables.SceneRunTable
import services.scene.utils.prompts.SceneReviewPrompts
import services.system.ai.AiPorts
import services.system.ai.objects.ImageBytes
import services.system.config.AppConfig
import services.system.db.{Database, Transaction}

/**
 * reviewscene 的评审编排（spec §9.5 / §9.6）：硬门禁 →（通过时）VLM 五维评分 → 裁决 →
 * 通过写 Succeeded(Ai) / 修订 attempts+1 回 Generating 并启动修复 fiber /
 * 构建崩溃 buildRepairs+1 修复（不占修订额度）/ 用尽写兜底。
 *
 * 评审无有效结果（2026-11-01 live 实测）：先重新评审一次；仍无效时额度内按需要修订处理，
 * 不再直接丢弃已经渲染成功的代码。用尽时兜底保留本轮/上一轮评审结果（spec §9.6），
 * 并把「沿用上一轮」的诊断写进 review.issues，绝不把已有 review_json 覆盖为 null。
 * 每轮被拒的代码与原因另存到 DATA_DIR/scene-diagnostics，供事后复盘（见 SceneDiagnostics）。
 *
 * 前置条件：ReviewSceneMessage 已用条件更新把运行原子推进到 Reviewing（防双花）。
 * 端口与数据库显式注入，便于测试验证「一次通过 / 修订后通过 / 用尽兜底 / 门禁失败 / 模型异常」。
 */
private[scene] object SceneReviewFlow:

  private val logger = LoggerFactory.getLogger(getClass)
  private val RevisionFailedCode = "GENERATION_FAILED"
  private val DiagnosticIssueLimit = 160

  def run(
    connection: Connection,
    database: Database,
    ports: AiPorts,
    config: AppConfig,
    run: SceneRun,
    captures: List[String],
    evidence: RuntimeEvidence
  ): IO[SceneRun] =
    val crashedBeforeRender = ReviewDecision.isCrashBeforeRender(captures, evidence)
    for
      captions <- loadCaptions(connection, run)
      parsedCaptures = SceneCaptures.parse(captures)
      gateIssues = ReviewDecision.gateFailures(
                     run,
                     evidence,
                     parsedCaptures,
                     config.scene.codeLimitKb,
                     crashedBeforeRender
                   )
      modelReview <- reviewWithModel(gateIssues, parsedCaptures, run, config, ports, captions, evidence)
      budget = RepairBudget(run.attempts, config.scene.maxRevisions, run.buildRepairs, SceneContract.MaxBuildRepairs)
      outcome = ReviewDecision.decide(gateIssues, crashedBeforeRender, modelReview, run.review, budget)
      failureReason = modelReview.flatMap(_.left.toOption)
      _ <- SceneDiagnostics.recordRejected(config.dataDir, run, outcome, gateIssues, failureReason)
      now <- CurrentTime.now
      _ <- persist(connection, database, ports, run, outcome, failureReason, now)
      current <- SceneRunTable.findById(connection, run.id)
    yield current.getOrElse(run)

  /**
   * 门禁失败不调用 VLM（None）。否则评审一次，无有效结果时再评审一次；返回通过规范化的评审（Right），
   * 或两次都无效时的原因（Left）。每次调用内部已含一次带原因的结构化重试。
   */
  private def reviewWithModel(
    gateIssues: List[String],
    captures: Either[List[String], List[ImageBytes]],
    run: SceneRun,
    config: AppConfig,
    ports: AiPorts,
    captions: Map[PhotoId, String],
    evidence: RuntimeEvidence
  ): IO[Option[Either[String, SceneReview]]] =
    if gateIssues.nonEmpty then IO.pure(None)
    else
      captures match
        case Left(captureIssues) =>
          IO.pure(Some(Left(s"截图证据不可用：${captureIssues.take(2).mkString("；")}")))
        case Right(images) =>
          val prompt = SceneReviewPrompts.review(run, captions, evidence)
          val reviewOnce: Int => IO[Either[String, SceneReview]] = call =>
            IO(
              logger.info(
                s"VLM 评审开始：runId=${run.id.value}，promptVersion=${SceneReviewPrompts.Version}，attempts=${run.attempts}，第 $call 次调用"
              )
            ) *>
              ports.review
                .review(prompt, images)
                .attempt
                .map(
                  _.left
                    .map(describe)
                    .flatMap(raw =>
                      ReviewDecision
                        .normalize(raw, config.scene.reviewPassScore)
                        .left
                        .map(reason => s"VLM 输出不符合 SceneReview 结构：$reason")
                    )
                )
          reviewOnce(1)
            .flatMap {
              case Left(reason) =>
                IO(logger.warn(s"VLM 评审无有效结果，重新评审一次：runId=${run.id.value}，原因：$reason")) *>
                  reviewOnce(2).map(_.left.map(retryReason => s"$reason；重新评审仍无效：$retryReason"))
              case valid => IO.pure(valid)
            }
            .map(Some(_))

  private def persist(
    connection: Connection,
    database: Database,
    ports: AiPorts,
    run: SceneRun,
    outcome: ReviewOutcome,
    failureReason: Option[String],
    now: Instant
  ): IO[Unit] =
    outcome match
      case ReviewOutcome.Passed(review) =>
        succeed(connection, run, now, SceneRunTable.markSucceededForAi(connection, run.id, review, now))
      case ReviewOutcome.Revise(review, issues) =>
        SceneRunTable.markRevising(connection, run.id, review, now).flatMap(updated =>
          relaunchIfStillReviewing(database, ports, run, issues, updated)
        )
      case ReviewOutcome.RepairBuild(review, issues) =>
        IO(logger.info(s"代码构建阶段崩溃，使用独立的构建修复额度：runId=${run.id.value}，buildRepairs=${run.buildRepairs}")) *>
          SceneRunTable.markBuildRepairing(connection, run.id, review, now).flatMap(updated =>
            relaunchIfStillReviewing(database, ports, run, issues, updated)
          )
      case ReviewOutcome.Fallback(review) =>
        // spec §9.6：兜底保留最后一次 review；本次无有效结果时保留上一轮，并把诊断写进 issues。
        val preserved = review.orElse(run.review)
        val enriched = preserved.map(base =>
          failureReason.fold(base)(reason => base.copy(issues = (diagnosticIssue(reason) :: base.issues).take(SceneContract.MaxReviewIssues)))
        )
        val logFallback = failureReason match
          case Some(reason) =>
            IO(
              logger.warn(
                s"评审无有效结果，兜底保留已有 review：runId=${run.id.value}，保存条数=${enriched.size}，原因：$reason"
              )
            )
          case None => IO.unit
        logFallback *>
          succeed(
            connection,
            run,
            now,
            SceneRunTable.markSucceededForFallback(connection, run.id, FallbackScene.code, enriched, now)
          )

  /**
   * 成功推进 + 当前场景指针（v1.14）：普通 generate 成功（含兜底）自动把指针指向本次运行；
   * 修订（revise）成功只是候选，不切指针；恢复的克隆不经本流程。状态迁移与指针写入同一事务。
   */
  private def succeed(connection: Connection, run: SceneRun, now: Instant, markSucceeded: IO[Int]): IO[Unit] =
    Transaction(connection) {
      markSucceeded.flatMap { updated =>
        if updated == 0 then IO(logger.warn(s"运行已不在 reviewing（可能被取消），跳过成功推进：runId=${run.id.value}"))
        else if run.kind == SceneRunKind.Generate then
          ExhibitionTable.setCurrentSceneRun(connection, run.exhibitionId, run.id, now).void
        else IO.unit
      }
    }

  private def relaunchIfStillReviewing(
    database: Database,
    ports: AiPorts,
    run: SceneRun,
    issues: List[String],
    updated: Int
  ): IO[Unit] =
    if updated == 0 then IO(logger.warn(s"运行已不在 reviewing（可能被取消），跳过修复：runId=${run.id.value}"))
    else launchRepair(database, ports, run.id, issues)

  private def diagnosticIssue(reason: String): String =
    val compact = Option(reason).map(_.replaceAll("\\s+", " ").trim).filter(_.nonEmpty).getOrElse("未知原因")
    val bounded = if compact.length <= DiagnosticIssueLimit then compact else compact.take(DiagnosticIssueLimit - 1) + "…"
    s"本次评审无有效模型输出（$bounded）：已沿用上一轮评审并回退兜底场景"

  private def launchRepair(database: Database, ports: AiPorts, runId: SceneRunId, issues: List[String]): IO[Unit] =
    SceneJobs
      .launch(database, runId, SceneGeneration.reviseWith(database, ports, runId, issues))
      .handleErrorWith(error =>
        IO(logger.error(s"启动场景修复 fiber 失败：runId=${runId.value}，${describe(error)}")) *>
          markFailed(database, runId, error)
      )

  private def markFailed(database: Database, runId: SceneRunId, error: Throwable): IO[Unit] =
    for
      now <- CurrentTime.now
      _ <- database
             .use(connection =>
               SceneRunTable.markFailed(
                 connection,
                 runId,
                 RevisionFailedCode,
                 s"场景修复失败：${describe(error)}",
                 now
               )
             )
             .void
    yield ()

  private def loadCaptions(connection: Connection, run: SceneRun): IO[Map[PhotoId, String]] =
    ExhibitionTable.findById(connection, run.exhibitionId).flatMap {
      case None => IO.pure(Map.empty)
      case Some(exhibition) =>
        SceneState.load(connection, exhibition).map(state => state.photos.map(photo => photo.id -> photo.caption).toMap)
    }

  private def describe(error: Throwable): String =
    Option(error.getMessage).filter(_.nonEmpty).getOrElse(error.getClass.getSimpleName)
