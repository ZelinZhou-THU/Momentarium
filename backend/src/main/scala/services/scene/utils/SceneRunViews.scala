package services.scene.utils

import services.scene.objects.SceneRun
import services.scene.objects.apiTypes.SceneRunView

/** SceneRun 行 → 前端视图的唯一转换点（避免多条 API 各写一遍映射）。
  * gallery.utils.ExhibitionViews 因跨服务不能复用本私有 util，保留一份同字段镜像；新增字段时两处同步。 */
private[scene] object SceneRunViews:
  /** isCurrent 只比较当前采用场景指针（v1.14）；未知指针时传 false。 */
  def view(run: SceneRun, isCurrent: Boolean = false): SceneRunView =
    SceneRunView(
      runId = run.id,
      exhibitionId = run.exhibitionId,
      status = run.status,
      source = run.source,
      attempts = run.attempts,
      hint = run.hint,
      photoIds = run.photoIds,
      curationVersion = run.curationVersion,
      brief = run.brief,
      code = run.code,
      review = run.review,
      errorCode = run.errorCode,
      errorMessage = run.errorMessage,
      createdAt = run.createdAt,
      updatedAt = run.updatedAt,
      kind = run.kind,
      parentRunId = run.parentRunId,
      revisionInstruction = run.revisionInstruction,
      isCurrent = isCurrent,
      dismissed = run.dismissed
    )
