package services.scene.utils

import java.time.Instant

import services.gallery.objects.PhotoId
import services.scene.objects.{SceneRun, SceneRunId, SceneRunKind, SceneRunStatus}
import services.scene.objects.apiTypes.SceneRunSummary
import services.users.objects.UserId

/** 版本历史的纯计算：摘要装配、草稿匹配、可恢复/可采用判定与恢复克隆（无副作用）。 */
private[scene] object SceneRunHistory:

  /** 与 gallery 的 sceneStale 判定同一口径：照片集合（不计顺序）与策展版本都一致。 */
  def matchesDraft(run: SceneRun, draftPhotoIds: Set[PhotoId], curationVersion: Int): Boolean =
    run.photoIds.toSet == draftPhotoIds && run.curationVersion == curationVersion

  /** 只有带代码、且能在当前运行时上执行的成功运行才能恢复。 */
  def restorable(run: SceneRun): Boolean =
    run.status == SceneRunStatus.Succeeded &&
      run.code.exists(_.nonEmpty) &&
      run.runtimeVersion == SceneContract.RuntimeVersion

  /**
   * 采用资格（api-contract §4.1 v1.14）：kind=revise + succeeded + 父运行仍为当前指针
   * + 照片集合/curationVersion/运行时仍匹配 + 非当前。只生成/恢复运行不提供采用。
   */
  def acceptable(
    run: SceneRun,
    currentRunId: Option[SceneRunId],
    draftPhotoIds: Set[PhotoId],
    curationVersion: Int
  ): Boolean =
    run.kind == SceneRunKind.Revise &&
      run.status == SceneRunStatus.Succeeded &&
      !run.dismissed &&
      !currentRunId.contains(run.id) &&
      run.parentRunId.exists(parentId => currentRunId.contains(parentId)) &&
      matchesDraft(run, draftPhotoIds, curationVersion) &&
      run.runtimeVersion == SceneContract.RuntimeVersion

  def summary(
    run: SceneRun,
    currentRunId: Option[SceneRunId],
    draftPhotoIds: Set[PhotoId],
    curationVersion: Int
  ): SceneRunSummary =
    val isCurrent = currentRunId.contains(run.id)
    SceneRunSummary(
      runId = run.id,
      status = run.status,
      source = run.source,
      attempts = run.attempts,
      hint = run.hint,
      mood = run.brief.map(_.mood),
      scores = run.review.map(_.scores),
      weightedScore = run.review.map(review => ReviewDecision.weightedScore(review.scores)),
      reviewSummary = run.review.map(_.summary),
      errorMessage = run.errorMessage,
      restoredFrom = run.restoredFrom,
      isCurrent = isCurrent,
      matchesCurrentDraft = matchesDraft(run, draftPhotoIds, curationVersion),
      restorable = restorable(run),
      createdAt = run.createdAt,
      kind = run.kind,
      parentRunId = run.parentRunId,
      revisionInstruction = run.revisionInstruction,
      acceptable = acceptable(run, currentRunId, draftPhotoIds, curationVersion),
      dismissed = run.dismissed
    )

  /** 恢复 = 克隆为新的 succeeded restore 运行；素材取当前草稿，restoredFrom 始终指向最初那次生成。 */
  def cloneForRestore(
    source: SceneRun,
    newId: SceneRunId,
    requestedBy: UserId,
    draftPhotoIds: List[PhotoId],
    curationVersion: Int,
    now: Instant
  ): SceneRun =
    source.copy(
      id = newId,
      requestedBy = requestedBy,
      status = SceneRunStatus.Succeeded,
      photoIds = draftPhotoIds,
      curationVersion = curationVersion,
      errorCode = None,
      errorMessage = None,
      createdAt = now,
      updatedAt = now,
      restoredFrom = Some(source.restoredFrom.getOrElse(source.id)),
      kind = SceneRunKind.Restore,
      parentRunId = None,
      revisionInstruction = None,
      dismissed = false
    )
