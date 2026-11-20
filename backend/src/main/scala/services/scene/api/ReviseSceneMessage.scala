package services.scene.api

import java.sql.Connection

import cats.effect.IO
import cats.syntax.all.*
import org.slf4j.LoggerFactory

import services.gallery.objects.Exhibition
import services.gallery.tables.ExhibitionTable
import services.scene.objects.{SceneRun, SceneRunId, SceneRunKind, SceneRunStatus}
import services.scene.objects.apiTypes.SceneRunView
import services.scene.tables.SceneRunTable
import services.scene.utils.{
  CurrentTime,
  SceneContract,
  SceneInstruction,
  SceneRevision,
  SceneRevisionCapacity,
  SceneRunViews,
  SceneState
}
import services.scene.utils.prompts.SceneRevisePrompts
import services.system.api.{
  APIWithTokenMessage,
  ApiError,
  ApiException,
  ConflictReason,
  ValidationReason
}
import services.system.db.Transaction
import services.system.startup.AppRuntime
import services.users.objects.UserId

/**
 * revisescene（api-contract v1.14 §4.2 / spec §10.6）：以当前采用场景为基线创建一条自然语言修订运行。
 *
 * 校验顺序：指令 1–500 码点（400 SCENE_INSTRUCTION_INVALID）→ 父运行存在且属于本人展览（404）→
 * 父运行 succeeded、父运行==当前采用场景指针、照片集合/curationVersion/运行时仍匹配（409 SCENE_REVISION_STALE）→
 * 无其他活跃运行（409 SCENE_RUN_ACTIVE）→ 父代码/提示词容量（400 SCENE_REVISION_TOO_LARGE）。
 *
 * 创建 kind=revise、parent_run_id、revision_instruction 的新运行（photoIds/curationVersion/runtime 继承父），
 * 起异步 fiber 复用既有状态机/截图评审/取消/失败；成功只是候选，不切当前指针、不覆盖父运行代码与评审。
 * 修订指令不写日志明文。
 */
final case class ReviseSceneMessage(
  userId: UserId,
  parentRunId: SceneRunId,
  instruction: String
) extends APIWithTokenMessage[SceneRunView]:

  private val logger = LoggerFactory.getLogger(getClass)

  override def plan(connection: Connection): IO[SceneRunView] =
    for
      normalized <- SceneInstruction.normalize(instruction).fold(
                      message => IO.raiseError(ApiException(ApiError.validation(ValidationReason.SceneInstructionInvalid, message))),
                      value => IO.pure(value)
                    )
      run <- Transaction(connection)(createRevision(connection, normalized))
      _ <- startRevision(run.id)
    yield SceneRunViews.view(run, isCurrent = false)

  private def createRevision(connection: Connection, normalizedInstruction: String): IO[SceneRun] =
    for
      parent <- SceneRunTable.findById(connection, parentRunId).flatMap {
                  case Some(found) => IO.pure(found)
                  case None => IO.raiseError(ApiException(ApiError.notFound("场景运行不存在")))
                }
      exhibition <- ExhibitionTable.requireOwned(connection, parent.exhibitionId, userId)
      state <- SceneState.load(connection, exhibition)
      config <- AppRuntime.config
      parentCode <- ensureReviseable(parent, exhibition, state)
      parentBrief <- parent.brief match
                       case Some(brief) => IO.pure(brief)
                       case None => IO.raiseError(ReviseSceneMessage.revisionStale)
      prompt = SceneRevisePrompts.reviseScene(
                 parent.id.value.toString,
                 parentBrief,
                 parentCode,
                 state,
                 normalizedInstruction,
                 config.scene.codeLimitKb
               )
      _ <- SceneRevisionCapacity.check(parentCode, prompt, config.scene.codeLimitKb) match
             case Left(reason) =>
               IO.raiseError(ApiException(ApiError.validation(ValidationReason.SceneRevisionTooLarge, reason)))
             case Right(_) => IO.unit
      active <- SceneRunTable.findActiveByExhibition(connection, exhibition.id)
      _ <- IO.raiseWhen(active.isDefined)(ReviseSceneMessage.runActive)
      now <- CurrentTime.now
      runId <- IO.randomUUID.map(SceneRunId.apply)
      run = SceneRun(
              id = runId,
              exhibitionId = parent.exhibitionId,
              requestedBy = userId,
              status = SceneRunStatus.Queued,
              source = None,
              hint = None,
              photoIds = parent.photoIds,
              curationVersion = parent.curationVersion,
              runtimeVersion = parent.runtimeVersion,
              brief = None,
              code = None,
              review = None,
              runtimeEvidence = None,
              attempts = 0,
              promptVersion = SceneRevisePrompts.Version,
              errorCode = None,
              errorMessage = None,
              createdAt = now,
              updatedAt = now,
              kind = SceneRunKind.Revise,
              parentRunId = Some(parent.id),
              revisionInstruction = Some(normalizedInstruction)
            )
      _ <- SceneRunTable.insert(connection, run).attempt.flatMap {
             case Right(_) => IO.unit
             case Left(error) =>
               // 并发请求可能在检查后插入活跃运行（部分唯一索引拒绝）：明确返回忙碌，不静默复用其他指令的任务。
               logger.warn(s"插入修订运行失败，检查是否已有活跃运行：${error.getMessage}")
               SceneRunTable.findActiveByExhibition(connection, exhibition.id).flatMap {
                 case Some(_) => IO.raiseError(ReviseSceneMessage.runActive)
                 case None => IO.raiseError(ApiException(ApiError.internal("创建修订运行失败")))
               }
           }
    yield run

  /** 父版本/素材/运行时校验：任一不满足都返回 409 SCENE_REVISION_STALE。返回父代码供容量检查。 */
  private def ensureReviseable(
    parent: SceneRun,
    exhibition: Exhibition,
    state: SceneState
  ): IO[String] =
    for
      _ <- IO.raiseUnless(parent.status == SceneRunStatus.Succeeded)(ReviseSceneMessage.revisionStale)
      _ <- IO.raiseUnless(exhibition.currentSceneRunId.contains(parent.id))(ReviseSceneMessage.revisionStale)
      _ <- IO.raiseUnless(parent.photoIds.toSet == state.photoIds)(ReviseSceneMessage.revisionStale)
      _ <- IO.raiseUnless(parent.curationVersion == exhibition.curationVersion)(ReviseSceneMessage.revisionStale)
      _ <- IO.raiseUnless(parent.runtimeVersion == SceneContract.RuntimeVersion)(ReviseSceneMessage.revisionStale)
      code <- parent.code.filter(_.trim.nonEmpty) match
                case Some(value) => IO.pure(value)
                case None => IO.raiseError(ReviseSceneMessage.revisionStale)
    yield code

  private def startRevision(runId: SceneRunId): IO[Unit] =
    (for
      database <- AppRuntime.database
      _ <- services.scene.utils.SceneJobs.launch(database, runId, SceneRevision.run(database, runId))
    yield ()).handleErrorWith(error =>
      IO(logger.error(s"启动场景修订 fiber 失败：runId=${runId.value}，${error.getMessage}"))
    )

object ReviseSceneMessage:
  private val runActive = ApiException(
    ApiError.conflict(ConflictReason.SceneRunActive, "有场景正在生成，请等它结束或停止后再修订")
  )
  private val revisionStale = ApiException(
    ApiError.conflict(ConflictReason.SceneRevisionStale, "父版本或素材已过期，请刷新当前场景后重新修订")
  )
