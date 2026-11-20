package services.scene.utils

import java.sql.Connection

import cats.effect.IO
import cats.syntax.all.*
import org.slf4j.LoggerFactory

import services.gallery.tables.ExhibitionTable
import services.scene.objects.{SceneBrief, SceneRun, SceneRunId, SceneSource}
import services.scene.tables.SceneRunTable
import services.scene.utils.prompts.SceneRevisePrompts
import services.system.ai.AiPorts
import services.system.ai.AiRuntime
import services.system.config.AppConfig
import services.system.db.Database
import services.system.startup.AppRuntime

/**
 * 修订生成链路（spec §10.6 / api-contract v1.14）：Queued → Generating →
 * （父题面 + 父代码 + 用户指令 → 修订代码 → 清洗）→ AwaitingCapture。
 *
 * - 之后复用既有 reviewscene 状态机/截图评审/取消/失败；评审要求修复时继续基于本修订结果与既有 repair 提示词。
 * - 只写本运行行，不覆盖父运行的代码与评审。
 * - 生成失败置 Failed(GENERATION_FAILED)，用户可重试或重新生成。
 * - 本流程在脱离请求的 fiber 内执行：自己从 AppRuntime 取 Database/配置，使用独立连接。
 */
private[scene] object SceneRevision:

  private val logger = LoggerFactory.getLogger(getClass)
  private val FailedCode = "GENERATION_FAILED"

  /** 供 revisescene 起 fiber 调用；端口从 AiRuntime 取，内部处理所有错误，不把异常抛回请求。 */
  def run(database: Database, runId: SceneRunId): IO[Unit] =
    AiRuntime.ports.flatMap(ports => runWith(database, ports, runId))

  /** 可注入 AI 端口的执行入口（测试用：注入失败端口验证修订失败路径）。 */
  def runWith(database: Database, ports: AiPorts, runId: SceneRunId): IO[Unit] =
    database
      .use(connection => revises(connection, ports, runId))
      .handleErrorWith(error =>
        IO(logger.error(s"场景修订流程异常（runId=${runId.value}）：${describe(error)}")) *>
          database.use(connection => markFailed(connection, runId, error))
      )

  private def revises(connection: Connection, ports: AiPorts, runId: SceneRunId): IO[Unit] =
    SceneRunTable.findById(connection, runId).flatMap {
      case None => IO(logger.error(s"场景修订找不到运行：runId=${runId.value}"))
      case Some(run) =>
        for
          now <- CurrentTime.now
          marked <- SceneRunTable.markGenerating(connection, run.id, now)
          _ <-
            if marked == 0 then IO(logger.warn(s"运行已不在 queued 状态，跳过修订：runId=${run.id.value}"))
            else reviseContent(connection, ports, run)
        yield ()
    }

  private def reviseContent(connection: Connection, ports: AiPorts, run: SceneRun): IO[Unit] =
    for
      config <- AppRuntime.config
      exhibition <- ExhibitionTable.findById(connection, run.exhibitionId).flatMap {
                      case Some(found) => IO.pure(found)
                      case None => IO.raiseError(new IllegalStateException("展览不存在，无法修订场景"))
                    }
      state <- SceneState.load(connection, exhibition)
      content <- generateRevisionCode(connection, ports, config, run, state).attempt
      now <- CurrentTime.now
      _ <- content match
             case Right((brief, code)) =>
               SceneRunTable.markAwaitingCapture(connection, run.id, SceneSource.Ai, brief, code, now).void
             case Left(error) =>
               IO(logger.warn(s"场景修订生成失败，运行置为失败等待重试：runId=${run.id.value}，原因：${describe(error)}")) *>
                 markFailed(connection, run.id, error)
    yield ()

  /** 读取父运行代码与题面作为不可信基线；不静默截断，超出容量时不发送请求而是让运行失败。 */
  private def generateRevisionCode(
    connection: Connection,
    ports: AiPorts,
    config: AppConfig,
    run: SceneRun,
    state: SceneState
  ): IO[(SceneBrief, String)] =
    for
      parent <- loadParent(connection, run)
      parentCode <- parent.code.filter(_.trim.nonEmpty) match
                      case Some(code) => IO.pure(code)
                      case None => IO.raiseError(new IllegalStateException("父运行缺少场景代码，无法修订"))
      parentBrief <- parent.brief match
                       case Some(brief) => IO.pure(brief)
                       case None => IO.raiseError(new IllegalStateException("父运行缺少题面，无法修订"))
      instruction = run.revisionInstruction.getOrElse("")
      prompt = SceneRevisePrompts.reviseScene(
                 run.id.value.toString,
                 parentBrief,
                 parentCode,
                 state,
                 instruction,
                 config.scene.codeLimitKb
               )
      _ <- SceneRevisionCapacity.check(parentCode, prompt, config.scene.codeLimitKb) match
             case Left(reason) => IO.raiseError(new IllegalStateException(reason))
             case Right(_) => IO.unit
      _ <- IO(
             logger.info(
               s"场景修订生成开始：runId=${run.id.value}，parentRunId=${parent.id.value}，promptVersion=${SceneRevisePrompts.Version}"
             )
           )
      rawCode <- ports.text.complete(prompt)
      code <- IO.fromEither(
                CodeSanitizer
                  .sanitize(rawCode, config.scene.codeLimitKb)
                  .left
                  .map(reason => new IllegalStateException(s"修订代码未通过基础校验：$reason"))
              )
    yield (parentBrief, code)

  private def loadParent(connection: Connection, run: SceneRun): IO[SceneRun] =
    run.parentRunId match
      case Some(parentRunId) =>
        SceneRunTable.findById(connection, parentRunId).flatMap {
          case Some(parent) => IO.pure(parent)
          case None => IO.raiseError(new IllegalStateException("父运行不存在，无法修订"))
        }
      case None => IO.raiseError(new IllegalStateException("修订运行缺少父运行，无法修订"))

  private def markFailed(connection: Connection, runId: SceneRunId, error: Throwable): IO[Unit] =
    CurrentTime.now.flatMap(now =>
      SceneRunTable
        .markFailed(
          connection,
          runId,
          FailedCode,
          s"场景修订失败：${describe(error)}。请重试或重新生成。",
          now
        )
        .void
    )

  private def describe(error: Throwable): String =
    Option(error.getMessage).filter(_.nonEmpty).getOrElse(error.getClass.getSimpleName)
