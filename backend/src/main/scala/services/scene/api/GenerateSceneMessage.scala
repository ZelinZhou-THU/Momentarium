package services.scene.api

import java.sql.Connection

import cats.effect.IO
import cats.syntax.all.*
import org.slf4j.LoggerFactory

import services.gallery.objects.ExhibitionId
import services.gallery.tables.ExhibitionTable
import services.scene.objects.{SceneRun, SceneRunId, SceneRunKind, SceneRunStatus}
import services.scene.objects.apiTypes.SceneRunView
import services.scene.tables.SceneRunTable
import services.scene.utils.{CurrentTime, SceneContract, SceneGeneration, SceneJobs, SceneRunViews, SceneState}
import services.system.api.{APIWithTokenMessage, ApiError, ApiException, ValidationReason}
import services.system.startup.AppRuntime
import services.users.objects.UserId

/**
 * generatescene（spec 6.6 / 9.6）：校验素材 → 幂等（已有未结束运行直接返回）→ 插入 Queued →
 * 起 fiber 异步生成（题面 → 代码 → 清洗；失败走兜底）→ 立刻返回运行视图，前端 2s 轮询 getscenerun。
 */
final case class GenerateSceneMessage(
  userId: UserId,
  exhibitionId: ExhibitionId,
  hint: Option[String]
) extends APIWithTokenMessage[SceneRunView]:

  private val logger = LoggerFactory.getLogger(getClass)

  override def plan(connection: Connection): IO[SceneRunView] =
    for
      _ <- validateHint
      exhibition <- ExhibitionTable.requireOwned(connection, exhibitionId, userId)
      state <- SceneState.load(connection, exhibition)
      _ <- validateMaterial(state)
      existing <- SceneRunTable.findActiveByExhibition(connection, exhibitionId)
      view <- existing match
                case Some(run) => IO.pure(SceneRunViews.view(run))
                case None => createAndStart(connection, state)
    yield view

  private def validateHint: IO[Unit] =
    hint match
      case Some(text) if text.length > SceneContract.MaxHintLength =>
        IO.raiseError(
          ApiException(ApiError.badRequest(s"氛围提示不能超过 ${SceneContract.MaxHintLength} 字"))
        )
      case _ => IO.unit

  /** spec 9.6 步骤 1：≥3 张照片、全部已分组、至少一个非空章节。 */
  private def validateMaterial(state: SceneState): IO[Unit] =
    val emptyGroups = state.groups.filter(group => !state.photos.exists(_.groupId.contains(group.id)))
    for
      _ <- IO.raiseWhen(state.photos.size < SceneContract.MinPhotoCount)(
             ApiException(ApiError.validation(ValidationReason.PhotoCount, s"场景至少需要 ${SceneContract.MinPhotoCount} 张照片"))
           )
      _ <- IO.raiseWhen(state.photos.exists(_.groupId.isEmpty))(
             ApiException(ApiError.validation(ValidationReason.PhotoUngrouped, "存在未分组照片"))
           )
      _ <- IO.raiseWhen(state.groups.isEmpty || emptyGroups.nonEmpty)(
             ApiException(ApiError.validation(ValidationReason.GroupEmpty, "至少需要一个非空章节"))
           )
    yield ()

  private def createAndStart(connection: Connection, state: SceneState): IO[SceneRunView] =
    for
      now <- CurrentTime.now
      runId <- IO.randomUUID.map(SceneRunId.apply)
      run = SceneRun(
        id = runId,
        exhibitionId = state.exhibition.id,
        requestedBy = userId,
        status = SceneRunStatus.Queued,
        source = None,
        hint = hint,
        photoIds = state.photos.map(_.id),
        curationVersion = state.exhibition.curationVersion,
        runtimeVersion = SceneContract.RuntimeVersion,
        brief = None,
        code = None,
        review = None,
        runtimeEvidence = None,
        attempts = 0,
        promptVersion = SceneContract.PromptVersion,
        errorCode = None,
        errorMessage = None,
        createdAt = now,
        updatedAt = now,
        kind = SceneRunKind.Generate
      )
      inserted <- SceneRunTable.insert(connection, run).attempt
      view <- inserted match
                case Right(_) =>
                  startGeneration(run.id) *> IO.pure(SceneRunViews.view(run))
                case Left(error) =>
                  // 并发下部分唯一索引会拒绝第二个活跃运行：返回已存在的运行（幂等语义）。
                  logger.warn(s"插入场景运行失败，检查是否已有活跃运行：${error.getMessage}")
                  SceneRunTable.findActiveByExhibition(connection, state.exhibition.id).flatMap {
                    case Some(existing) => IO.pure(SceneRunViews.view(existing))
                    case None => IO.raiseError(ApiException(ApiError.internal("创建场景运行失败")))
                  }
    yield view

  private def startGeneration(runId: SceneRunId): IO[Unit] =
    (for
      database <- AppRuntime.database
      _ <- SceneJobs.launch(database, runId, SceneGeneration.run(database, runId))
    yield ()).handleErrorWith(error =>
      IO(logger.error(s"启动场景生成 fiber 失败：runId=${runId.value}，${error.getMessage}"))
    )
