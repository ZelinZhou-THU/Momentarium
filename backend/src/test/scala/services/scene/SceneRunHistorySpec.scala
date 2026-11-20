package services.scene

import java.time.Instant
import java.util.UUID

import services.gallery.objects.{ExhibitionId, PhotoId}
import services.scene.objects.*
import services.scene.utils.{SceneContract, SceneRunHistory}
import services.users.objects.UserId

class SceneRunHistorySpec extends munit.FunSuite:
  private val now = Instant.parse("2026-10-31T10:00:00Z")
  private val photoA = PhotoId(UUID.randomUUID())
  private val photoB = PhotoId(UUID.randomUUID())
  private val scores = RubricScores(4, 3, 4, 4, 3)

  private def run(status: SceneRunStatus, code: Option[String] = Some("function build(ctx) {}")): SceneRun =
    SceneRun(
      id = SceneRunId(UUID.randomUUID()),
      exhibitionId = ExhibitionId(UUID.randomUUID()),
      requestedBy = UserId(UUID.randomUUID()),
      status = status,
      source = if status == SceneRunStatus.Succeeded then Some(SceneSource.Ai) else None,
      hint = None,
      photoIds = List(photoA, photoB),
      curationVersion = 3,
      runtimeVersion = SceneContract.RuntimeVersion,
      brief = Some(SceneBrief("雾中的眷恋", "海边的光。", "题面", "导语", List("#0B1020"), Nil, None)),
      code = code,
      review = Some(SceneReview(scores, ReviewVerdict.Pass, List("composition｜左侧｜加一棵树"), "整体成立")),
      runtimeEvidence = None,
      attempts = 1,
      promptVersion = "scene-parent-v3.2",
      errorCode = None,
      errorMessage = None,
      createdAt = now,
      updatedAt = now
    )

  test("matchesDraft：照片集合（不计顺序）与策展版本都一致才算匹配") {
    val succeeded = run(SceneRunStatus.Succeeded)
    assert(SceneRunHistory.matchesDraft(succeeded, Set(photoB, photoA), 3))
    assert(!SceneRunHistory.matchesDraft(succeeded, Set(photoA), 3))
    assert(!SceneRunHistory.matchesDraft(succeeded, Set(photoA, photoB), 4))
  }

  test("restorable：只有带代码、运行时版本一致的 succeeded 运行可恢复") {
    assert(SceneRunHistory.restorable(run(SceneRunStatus.Succeeded)))
    assert(!SceneRunHistory.restorable(run(SceneRunStatus.Failed)))
    assert(!SceneRunHistory.restorable(run(SceneRunStatus.Succeeded, code = None)))
    assert(!SceneRunHistory.restorable(run(SceneRunStatus.Succeeded).copy(runtimeVersion = "legacy")))
  }

  test("summary：带出心情、分数、加权分、当前标记与草稿匹配") {
    val succeeded = run(SceneRunStatus.Succeeded)
    val summary = SceneRunHistory.summary(succeeded, Some(succeeded.id), Set(photoA, photoB), 3)
    assertEquals(summary.mood, Some("雾中的眷恋"))
    assertEquals(summary.scores, Some(scores))
    assertEqualsDouble(summary.weightedScore.getOrElse(0.0), 3.65, 1e-9)
    assertEquals((summary.isCurrent, summary.matchesCurrentDraft, summary.restorable), (true, true, true))
  }

  test("summary：失败运行不是当前、不可恢复，错误信息保留") {
    val failed = run(SceneRunStatus.Failed).copy(errorMessage = Some("模型连接中断"), review = None)
    val summary = SceneRunHistory.summary(failed, None, Set(photoA, photoB), 3)
    assertEquals((summary.isCurrent, summary.restorable, summary.weightedScore), (false, false, None))
    assertEquals(summary.errorMessage, Some("模型连接中断"))
  }

  test("summary：kind/parentRunId 透出；ordinary generate 运行不可采用") {
    val succeeded = run(SceneRunStatus.Succeeded)
    val summary = SceneRunHistory.summary(succeeded, Some(succeeded.id), Set(photoA, photoB), 3)
    assertEquals((summary.kind, summary.parentRunId), (SceneRunKind.Generate, None))
    assertEquals(summary.acceptable, false)
  }

  test("acceptable：修订候选需 succeeded + 父运行仍为当前 + 素材匹配 + 非当前") {
    val parent = run(SceneRunStatus.Succeeded)
    val draft = Set(photoA, photoB)
    val candidate = run(SceneRunStatus.Succeeded).copy(
      kind = SceneRunKind.Revise,
      parentRunId = Some(parent.id)
    )
    assert(SceneRunHistory.acceptable(candidate, Some(parent.id), draft, 3), "满足全部条件")
    assert(!SceneRunHistory.acceptable(candidate, Some(candidate.id), draft, 3), "已是当前不再可采用")
    assert(!SceneRunHistory.acceptable(candidate, None, draft, 3), "父运行不再是当前")
    assert(!SceneRunHistory.acceptable(candidate, Some(parent.id), Set(photoA), 3), "照片集合过期")
    assert(!SceneRunHistory.acceptable(candidate, Some(parent.id), draft, 4), "curationVersion 过期")
    assert(
      !SceneRunHistory.acceptable(candidate.copy(runtimeVersion = "legacy-0"), Some(parent.id), draft, 3),
      "运行时过期"
    )
    assert(!SceneRunHistory.acceptable(candidate.copy(status = SceneRunStatus.Failed), Some(parent.id), draft, 3))
    assert(
      !SceneRunHistory.acceptable(candidate.copy(kind = SceneRunKind.Generate), Some(parent.id), draft, 3),
      "普通生成不可采用"
    )
  }

  test("cloneForRestore：新 id、restore 种类、成功态、素材取当前草稿、restoredFrom 指向最初来源") {
    val original = run(SceneRunStatus.Succeeded)
    val restoredOnce = original.copy(id = SceneRunId(UUID.randomUUID()), restoredFrom = Some(original.id))
    val newId = SceneRunId(UUID.randomUUID())
    val later = Instant.parse("2026-10-31T11:00:00Z")
    val requester = UserId(UUID.randomUUID())
    val cloned = SceneRunHistory.cloneForRestore(restoredOnce, newId, requester, List(photoB), 7, later)
    assertEquals((cloned.id, cloned.status, cloned.requestedBy), (newId, SceneRunStatus.Succeeded, requester))
    assertEquals((cloned.photoIds, cloned.curationVersion), (List(photoB), 7))
    assertEquals(cloned.restoredFrom, Some(original.id))
    assertEquals((cloned.code, cloned.review), (original.code, original.review))
    assertEquals((cloned.createdAt, cloned.updatedAt), (later, later))
    assertEquals((cloned.kind, cloned.parentRunId, cloned.revisionInstruction), (SceneRunKind.Restore, None, None))
  }
