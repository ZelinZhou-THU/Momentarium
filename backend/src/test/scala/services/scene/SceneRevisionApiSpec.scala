package services.scene

import java.sql.Connection
import java.util.UUID

import cats.effect.IO
import cats.syntax.all.*

import munit.CatsEffectSuite

import services.gallery.api.{GetExhibitionMessage, PublishExhibitionMessage}
import services.gallery.objects.*
import services.gallery.tables.ExhibitionTable
import services.scene.api.{
  AcceptSceneRunMessage,
  CancelSceneMessage,
  DismissSceneRunMessage,
  GenerateSceneMessage,
  GetPublishedSceneMessage,
  ListSceneRunsMessage,
  ReviewSceneMessage,
  ReviseSceneMessage
}
import services.scene.objects.*
import services.scene.objects.apiTypes.SceneRunView
import services.scene.tables.SceneRunTable
import services.scene.utils.SceneRevision
import services.system.ai.AiPorts
import services.system.ai.fake.{FakeLocationModel, FakeReviewModel, FakeVisionModel}
import services.system.ai.objects.{StructuredPrompt, TextPrompt}
import services.system.ai.ports.TextModel
import services.system.api.{ApiException, ConflictReason, ErrorCode, ValidationReason}
import services.system.db.{Sql, SqlValue}
import services.users.objects.UserId

/**
 * 阶段 4 后端集成测试（真实测试库 + fake AI）：
 * 修订候选 → 评审成功 → 采用 → 再发布；过期/活跃/指令/容量/越权错误；
 * accept 资格校验；修订失败不影响指针/父运行；普通生成成功自动切当前指针。
 */
class SceneRevisionApiSpec extends CatsEffectSuite with SceneTestSupport:

  test("并发采用与放弃同一候选只允许一个成功") {
    withDatabase { (database, connection, _) =>
      for
        seeded <- seedExhibition(connection)
        (owner, exhibitionId, photos) = seeded
        parent <- insertSucceededParent(connection, owner, exhibitionId, photos, SampleCode)
        _ <- setCurrentRun(connection, exhibitionId, parent.id)
        candidate <- insertRevisionCandidate(connection, owner, exhibitionId, photos, parent.id, curationVersion = 1)
        results <- (
                     database.use(c => AcceptSceneRunMessage(owner, candidate.id).plan(c)).attempt,
                     database.use(c => DismissSceneRunMessage(owner, candidate.id).plan(c)).attempt
                   ).parTupled
        (accepted, dismissed) = results
        _ = assert(accepted.isRight != dismissed.isRight)
        stored <- requireRun(connection, candidate.id)
        pointer <- currentPointer(connection, exhibitionId)
        _ = assertEquals(stored.dismissed, dismissed.isRight)
        _ = assertEquals(pointer, Some(if accepted.isRight then candidate.id else parent.id))
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("放弃修订候选持久生效，不能采用且不影响当前场景") {
    withDatabase { (_, connection, _) =>
      for
        seeded <- seedExhibition(connection)
        (owner, exhibitionId, photos) = seeded
        parent <- insertSucceededParent(connection, owner, exhibitionId, photos, SampleCode)
        _ <- setCurrentRun(connection, exhibitionId, parent.id)
        candidate <- insertRevisionCandidate(connection, owner, exhibitionId, photos, parent.id, curationVersion = 1)
        _ <- Sql.update(connection, "UPDATE scene.scene_runs SET created_at = created_at + interval '1 second' WHERE id = ?",
               List(SqlValue.Uuid(candidate.id.value)))
        stranger = UserId(UUID.randomUUID())
        _ <- expectCode(DismissSceneRunMessage(stranger, candidate.id).plan(connection), ErrorCode.NotFound)
        dismissed <- DismissSceneRunMessage(owner, candidate.id).plan(connection)
        _ = assert(dismissed.dismissed)
        again <- DismissSceneRunMessage(owner, candidate.id).plan(connection)
        _ = assert(again.dismissed, "重复放弃应幂等")
        detail <- GetExhibitionMessage(owner, exhibitionId).plan(connection)
        _ = assertEquals(detail.sceneRun.map(_.dismissed), Some(true))
        _ = assertEquals(detail.currentSceneRun.map(_.runId), Some(parent.id))
        history <- ListSceneRunsMessage(owner, exhibitionId).plan(connection)
        _ = assertEquals(history.runs.find(_.runId == candidate.id).map(_.acceptable), Some(false))
        _ = assertEquals(history.runs.find(_.runId == candidate.id).map(_.dismissed), Some(true), "历史摘要标注已放弃")
        _ = assertEquals(history.runs.find(_.runId == parent.id).map(_.dismissed), Some(false))
        _ <- expectReason(AcceptSceneRunMessage(owner, candidate.id).plan(connection), ErrorCode.Conflict,
               ConflictReason.SceneRunNotAcceptable)
        _ <- expectReason(DismissSceneRunMessage(owner, parent.id).plan(connection), ErrorCode.Conflict,
               ConflictReason.SceneRunNotAcceptable)
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  private final class FailingTextModel extends TextModel:
    override def structured[A: io.circe.Decoder](prompt: StructuredPrompt): IO[A] =
      IO.raiseError(new IllegalStateException("测试注入：修订模型失败"))
    override def complete(prompt: TextPrompt): IO[String] =
      IO.raiseError(new IllegalStateException("测试注入：修订模型失败"))

  test("修订候选不切指针、父运行不被覆盖；采用后切指针且需重新发布") {
    withDatabase { (_, connection, _) =>
      for
        seeded <- seedExhibition(connection)
        (owner, exhibitionId, photos) = seeded
        parent <- insertSucceededParent(connection, owner, exhibitionId, photos, SampleCode)
        _ <- setCurrentRun(connection, exhibitionId, parent.id)

        _ <- PublishExhibitionMessage(owner, exhibitionId).plan(connection)
        published <- GetExhibitionMessage(owner, exhibitionId).plan(connection)
        _ = assertEquals(published.hasUnpublishedChanges, false)
        _ = assertEquals(published.currentSceneRun.map(_.runId), Some(parent.id))
        _ = assertEquals(published.sceneRun.map(_.runId), Some(parent.id))

        revised <- ReviseSceneMessage(owner, parent.id, "  把灯塔的暖光调亮一点，雾稍微淡一些。  ").plan(connection)
        _ = assertEquals(revised.kind, SceneRunKind.Revise)
        _ = assertEquals(revised.parentRunId, Some(parent.id))
        _ = assertEquals(revised.revisionInstruction, Some("把灯塔的暖光调亮一点，雾稍微淡一些。"))
        _ = assertEquals(revised.isCurrent, false)
        _ = assertEquals(revised.status, SceneRunStatus.Queued)

        completed <- awaitStatus(connection, revised.runId, Set(SceneRunStatus.AwaitingCapture))
        _ = assertEquals(completed.kind, SceneRunKind.Revise)
        _ = assert(completed.code.exists(_.nonEmpty), "修订候选必须带可渲染代码")
        _ = assert(completed.brief.isDefined, "修订运行需继承父题面")

        // 父运行代码/评审不被覆盖；指针仍指向父运行。
        parentAfter <- requireRun(connection, parent.id)
        _ = assertEquals((parentAfter.code, parentAfter.review), (parent.code, parent.review))
        pointerAfterRevise <- currentPointer(connection, exhibitionId)
        _ = assertEquals(pointerAfterRevise, Some(parent.id))

        detailAfterRevise <- GetExhibitionMessage(owner, exhibitionId).plan(connection)
        _ = assertEquals(detailAfterRevise.currentSceneRun.map(_.runId), Some(parent.id))
        _ = assertEquals(detailAfterRevise.sceneRun.map(_.runId), Some(revised.runId))
        _ = assertEquals(detailAfterRevise.sceneRun.map(_.kind), Some(SceneRunKind.Revise))
        _ = assertEquals(detailAfterRevise.sceneStale, false, "未采用候选不影响当前场景过期判断")
        _ = assertEquals(detailAfterRevise.scenePalette, parent.brief.toList.flatMap(_.palette), "草稿配色取当前指针")
        _ = assertEquals(detailAfterRevise.hasUnpublishedChanges, false, "只生成未采用候选不算未发布修改")

        reviewed <- ReviewSceneMessage(owner, revised.runId, validCaptures, validEvidence(photos.map(_.id))).plan(connection)
        _ = assertEquals(reviewed.status, SceneRunStatus.Succeeded)
        _ = assertEquals(reviewed.isCurrent, false)
        pointerAfterSuccess <- currentPointer(connection, exhibitionId)
        _ = assertEquals(pointerAfterSuccess, Some(parent.id), "修订成功不自动切当前指针")

        // 未采用候选期间发布仍冻结当前指针（父运行）。
        _ <- PublishExhibitionMessage(owner, exhibitionId).plan(connection)
        publicBeforeAccept <- GetPublishedSceneMessage(exhibitionId).plan(connection)
        _ = assertEquals(Option(publicBeforeAccept.code), parent.code)

        historyBeforeAccept <- ListSceneRunsMessage(owner, exhibitionId).plan(connection)
        parentSummary = historyBeforeAccept.runs.find(_.runId == parent.id).get
        reviseSummary = historyBeforeAccept.runs.find(_.runId == revised.runId).get
        _ = assertEquals(parentSummary.isCurrent, true)
        _ = assertEquals(reviseSummary.isCurrent, false)
        _ = assertEquals(reviseSummary.acceptable, true)
        _ = assertEquals(reviseSummary.kind, SceneRunKind.Revise)
        _ = assertEquals(reviseSummary.parentRunId, Some(parent.id))
        _ = assertEquals(reviseSummary.revisionInstruction, revised.revisionInstruction, "v1.15 列表摘要带修订要求")
        _ = assertEquals(parentSummary.revisionInstruction, None, "非修订运行没有修订要求")
        _ = assert(reviseSummary.matchesCurrentDraft)

        accepted <- AcceptSceneRunMessage(owner, revised.runId).plan(connection)
        _ = assertEquals(accepted.isCurrent, true)
        _ = assertEquals(accepted.runId, revised.runId)
        pointerAfterAccept <- currentPointer(connection, exhibitionId)
        _ = assertEquals(pointerAfterAccept, Some(revised.runId))

        detailAfterAccept <- GetExhibitionMessage(owner, exhibitionId).plan(connection)
        _ = assertEquals(detailAfterAccept.currentSceneRun.map(_.runId), Some(revised.runId))
        _ = assertEquals(detailAfterAccept.hasUnpublishedChanges, true, "采用后需重新发布")
        publicStill <- GetPublishedSceneMessage(exhibitionId).plan(connection)
        _ = assertEquals(Option(publicStill.code), parent.code, "采用只改草稿指针，公开页在重新发布前不变")

        again <- AcceptSceneRunMessage(owner, revised.runId).plan(connection)
        _ = assertEquals((again.runId, again.isCurrent), (revised.runId, true), "已是当前时幂等成功")

        historyAfterAccept <- ListSceneRunsMessage(owner, exhibitionId).plan(connection)
        afterSummary = historyAfterAccept.runs.find(_.runId == revised.runId).get
        _ = assertEquals((afterSummary.isCurrent, afterSummary.acceptable), (true, false))

        _ <- PublishExhibitionMessage(owner, exhibitionId).plan(connection)
        publicAfterAccept <- GetPublishedSceneMessage(exhibitionId).plan(connection)
        _ = assertEquals(Option(publicAfterAccept.code), completed.code, "重新发布后公开页使用采用的修订场景")

        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("revisescene 校验：不存在/越权/指令非法/活跃/父过期/容量") {
    withDatabase { (_, connection, _) =>
      val stranger = UserId(UUID.randomUUID())
      for
        seeded <- seedExhibition(connection)
        (owner, exhibitionId, photos) = seeded
        parent <- insertSucceededParent(connection, owner, exhibitionId, photos, SampleCode)
        _ <- setCurrentRun(connection, exhibitionId, parent.id)

        missingRunId <- IO.randomUUID.map(SceneRunId.apply)
        _ <- expectCode(ReviseSceneMessage(owner, missingRunId, "改成黄昏").plan(connection), ErrorCode.NotFound)
        _ <- expectCode(ReviseSceneMessage(stranger, parent.id, "改成黄昏").plan(connection), ErrorCode.NotFound)

        _ <- expectReason(
               ReviseSceneMessage(owner, parent.id, "   ").plan(connection),
               ErrorCode.Validation,
               ValidationReason.SceneInstructionInvalid
             )
        _ <- expectReason(
               ReviseSceneMessage(owner, parent.id, "调亮\u0000其余").plan(connection),
               ErrorCode.Validation,
               ValidationReason.SceneInstructionInvalid
             )
        _ <- expectReason(
               ReviseSceneMessage(owner, parent.id, "灯" * 501).plan(connection),
               ErrorCode.Validation,
               ValidationReason.SceneInstructionInvalid
             )

        // 合法指令（含换行/制表符）可创建修订运行；结束后取消释放活跃名额。
        ok <- ReviseSceneMessage(owner, parent.id, "  把灯塔调亮\n\t雾淡一些  ").plan(connection)
        _ = assertEquals(ok.revisionInstruction, Some("把灯塔调亮\n\t雾淡一些"))
        _ <- awaitStatus(connection, ok.runId, Set(SceneRunStatus.AwaitingCapture))
        _ <- CancelSceneMessage(owner, ok.runId).plan(connection)

        // 已有活跃运行时返回 409 SCENE_RUN_ACTIVE，而不是静默复用。
        queued <- newRun(owner, exhibitionId, photos, status = SceneRunStatus.Queued)
        _ <- SceneRunTable.insert(connection, queued)
        _ <- expectReason(
               ReviseSceneMessage(owner, parent.id, "改成黄昏").plan(connection),
               ErrorCode.Conflict,
               ConflictReason.SceneRunActive
             )
        _ <- CancelSceneMessage(owner, queued.id).plan(connection)

        // 父运行不再是当前指针 → 409 SCENE_REVISION_STALE。
        other <- insertSucceededParent(connection, owner, exhibitionId, photos, SampleCode)
        _ <- setCurrentRun(connection, exhibitionId, other.id)
        _ <- expectReason(
               ReviseSceneMessage(owner, parent.id, "改成黄昏").plan(connection),
               ErrorCode.Conflict,
               ConflictReason.SceneRevisionStale
             )

        // 草稿素材版本落后 → 409 SCENE_REVISION_STALE。
        _ <- setCurrentRun(connection, exhibitionId, parent.id)
        _ <- bumpCurationVersion(connection, exhibitionId)
        _ <- expectReason(
               ReviseSceneMessage(owner, parent.id, "改成黄昏").plan(connection),
               ErrorCode.Conflict,
               ConflictReason.SceneRevisionStale
             )

        // 运行时版本不一致 → 409 SCENE_REVISION_STALE。
        legacyParent <- newRun(
                          owner,
                          exhibitionId,
                          photos,
                          status = SceneRunStatus.Succeeded,
                          source = Some(SceneSource.Ai),
                          brief = Some(sampleBrief()),
                          code = Some(SampleCode)
                        ).map(_.copy(runtimeVersion = "legacy-0", curationVersion = 2))
        _ <- SceneRunTable.insert(connection, legacyParent)
        _ <- setCurrentRun(connection, exhibitionId, legacyParent.id)
        _ <- expectReason(
               ReviseSceneMessage(owner, legacyParent.id, "改成黄昏").plan(connection),
               ErrorCode.Conflict,
               ConflictReason.SceneRevisionStale
             )

        // 容量：父代码超过 SCENE_CODE_LIMIT_KB（默认 1024 KB）→ 400 SCENE_REVISION_TOO_LARGE，不静默截断。
        capacity <- seedExhibition(connection)
        (capacityOwner, capacityExhibitionId, capacityPhotos) = capacity
        oversizedCode = "function build(ctx) {" + (" ".repeat(1024 * 1024 + 8)) + "}"
        oversizedParent <- insertSucceededParent(connection, capacityOwner, capacityExhibitionId, capacityPhotos, oversizedCode)
        _ <- setCurrentRun(connection, capacityExhibitionId, oversizedParent.id)
        _ <- expectReason(
               ReviseSceneMessage(capacityOwner, oversizedParent.id, "改成黄昏").plan(connection),
               ErrorCode.Validation,
               ValidationReason.SceneRevisionTooLarge
             )

        _ <- cleanup(connection, exhibitionId)
        _ <- cleanup(connection, capacityExhibitionId)
      yield ()
    }
  }

  test("acceptscenerun 校验：非修订/未成功/父过期/不存在/越权") {
    withDatabase { (_, connection, _) =>
      val stranger = UserId(UUID.randomUUID())
      for
        seeded <- seedExhibition(connection)
        (owner, exhibitionId, photos) = seeded
        parent <- insertSucceededParent(connection, owner, exhibitionId, photos, SampleCode)
        _ <- setCurrentRun(connection, exhibitionId, parent.id)

        _ <- expectReason(
               AcceptSceneRunMessage(owner, parent.id).plan(connection),
               ErrorCode.Conflict,
               ConflictReason.SceneRunNotAcceptable
             )
        _ <- expectCode(AcceptSceneRunMessage(owner, SceneRunId(UUID.randomUUID())).plan(connection), ErrorCode.NotFound)
        _ <- expectCode(AcceptSceneRunMessage(stranger, parent.id).plan(connection), ErrorCode.NotFound)

        failedRevision <- newRun(
                            owner,
                            exhibitionId,
                            photos,
                            status = SceneRunStatus.Failed,
                            kind = SceneRunKind.Revise,
                            parentRunId = Some(parent.id)
                          )
        _ <- SceneRunTable.insert(connection, failedRevision)
        _ <- expectReason(
               AcceptSceneRunMessage(owner, failedRevision.id).plan(connection),
               ErrorCode.Conflict,
               ConflictReason.SceneRunNotAcceptable
             )

        queuedRevision <- newRun(
                            owner,
                            exhibitionId,
                            photos,
                            status = SceneRunStatus.Queued,
                            kind = SceneRunKind.Revise,
                            parentRunId = Some(parent.id)
                          )
        _ <- SceneRunTable.insert(connection, queuedRevision)
        _ <- expectReason(
               AcceptSceneRunMessage(owner, queuedRevision.id).plan(connection),
               ErrorCode.Conflict,
               ConflictReason.SceneRunNotAcceptable
             )
        _ <- CancelSceneMessage(owner, queuedRevision.id).plan(connection)

        // 父运行不再指向当前指针 → 409 SCENE_REVISION_STALE。
        other <- insertSucceededParent(connection, owner, exhibitionId, photos, SampleCode)
        _ <- setCurrentRun(connection, exhibitionId, other.id)
        staleCandidate <- insertRevisionCandidate(connection, owner, exhibitionId, photos, parent.id, curationVersion = 1)
        _ <- expectReason(
               AcceptSceneRunMessage(owner, staleCandidate.id).plan(connection),
               ErrorCode.Conflict,
               ConflictReason.SceneRevisionStale
             )

        // 素材版本不再匹配 → 409 SCENE_REVISION_STALE。
        _ <- setCurrentRun(connection, exhibitionId, parent.id)
        materialStale <- insertRevisionCandidate(connection, owner, exhibitionId, photos, parent.id, curationVersion = 99)
        _ <- expectReason(
               AcceptSceneRunMessage(owner, materialStale.id).plan(connection),
               ErrorCode.Conflict,
               ConflictReason.SceneRevisionStale
             )

        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("修订生成失败：运行置 failed(GENERATION_FAILED)，当前指针与父运行不变") {
    withDatabase { (database, connection, _) =>
      for
        seeded <- seedExhibition(connection)
        (owner, exhibitionId, photos) = seeded
        parent <- insertSucceededParent(connection, owner, exhibitionId, photos, SampleCode)
        _ <- setCurrentRun(connection, exhibitionId, parent.id)
        reviseRun <- newRun(
                       owner,
                       exhibitionId,
                       photos,
                       status = SceneRunStatus.Queued,
                       kind = SceneRunKind.Revise,
                       parentRunId = Some(parent.id),
                       revisionInstruction = Some("把灯塔调亮")
                     )
        _ <- SceneRunTable.insert(connection, reviseRun)
        failingPorts = AiPorts(new FailingTextModel(), FakeVisionModel(), FakeLocationModel(), FakeReviewModel())
        _ <- SceneRevision.runWith(database, failingPorts, reviseRun.id)
        reloaded <- requireRun(connection, reviseRun.id)
        _ = assertEquals(reloaded.status, SceneRunStatus.Failed)
        _ = assertEquals(reloaded.errorCode, Some("GENERATION_FAILED"))
        _ = assert(reloaded.errorMessage.exists(_.contains("场景修订失败")))
        pointer <- currentPointer(connection, exhibitionId)
        _ = assertEquals(pointer, Some(parent.id), "修订失败不改当前指针")
        parentAfter <- requireRun(connection, parent.id)
        _ = assertEquals(parentAfter.code, parent.code)
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("普通生成成功自动把当前指针指向新运行") {
    withDatabase { (_, connection, _) =>
      for
        seeded <- seedExhibition(connection)
        (owner, exhibitionId, photos) = seeded
        generated <- GenerateSceneMessage(owner, exhibitionId, None).plan(connection)
        awaiting <- awaitStatus(connection, generated.runId, Set(SceneRunStatus.AwaitingCapture))
        pointerBeforeReview <- currentPointer(connection, exhibitionId)
        _ = assertEquals(pointerBeforeReview, None, "生成完成到评审前还没有当前场景")
        reviewed <- ReviewSceneMessage(owner, awaiting.id, validCaptures, validEvidence(photos.map(_.id))).plan(connection)
        _ = assertEquals(reviewed.status, SceneRunStatus.Succeeded)
        _ = assertEquals(reviewed.isCurrent, true)
        pointerAfter <- currentPointer(connection, exhibitionId)
        _ = assertEquals(pointerAfter, Some(awaiting.id), "普通生成成功自动切换当前指针")
        detail <- GetExhibitionMessage(owner, exhibitionId).plan(connection)
        _ = assertEquals(detail.currentSceneRun.map(_.runId), Some(awaiting.id))
        _ = assertEquals(detail.sceneStale, false)
        _ = assert(detail.scenePalette.nonEmpty, "生成成功的题面主色用于草稿配色")
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  // ---------- 辅助 ----------

  private def insertSucceededParent(
    connection: Connection,
    owner: UserId,
    exhibitionId: ExhibitionId,
    photos: List[ExhibitionPhoto],
    code: String
  ): IO[SceneRun] =
    for
      run <- newRun(
               owner,
               exhibitionId,
               photos,
               status = SceneRunStatus.Succeeded,
               source = Some(SceneSource.Ai),
               brief = Some(sampleBrief()),
               code = Some(code),
               review = Some(SceneReview(RubricScores(4, 4, 4, 4, 4), ReviewVerdict.Pass, Nil, "通过"))
             )
      _ <- SceneRunTable.insert(connection, run)
    yield run

  /** 直接插入一条 succeeded 修订候选（不经过异步链路），用于 accept 资格校验。 */
  private def insertRevisionCandidate(
    connection: Connection,
    owner: UserId,
    exhibitionId: ExhibitionId,
    photos: List[ExhibitionPhoto],
    parentRunId: SceneRunId,
    curationVersion: Int
  ): IO[SceneRun] =
    for
      run <- newRun(
               owner,
               exhibitionId,
               photos,
               status = SceneRunStatus.Succeeded,
               source = Some(SceneSource.Ai),
               brief = Some(sampleBrief()),
               code = Some(SampleCode),
               review = Some(SceneReview(RubricScores(4, 4, 4, 4, 4), ReviewVerdict.Pass, Nil, "通过")),
               kind = SceneRunKind.Revise,
               parentRunId = Some(parentRunId)
             )
      prepared = run.copy(curationVersion = curationVersion)
      _ <- SceneRunTable.insert(connection, prepared)
    yield prepared

  private def currentPointer(connection: Connection, exhibitionId: ExhibitionId): IO[Option[SceneRunId]] =
    ExhibitionTable.findById(connection, exhibitionId).map(_.flatMap(_.currentSceneRunId))

  private def bumpCurationVersion(connection: Connection, exhibitionId: ExhibitionId): IO[Unit] =
    Sql
      .update(
        connection,
        "UPDATE gallery.exhibitions SET curation_version = curation_version + 1, updated_at = now() WHERE id = ?",
        List(SqlValue.Uuid(exhibitionId.value))
      )
      .void

  private def expectCode(action: IO[?], code: ErrorCode): IO[Unit] =
    action.attempt.map {
      case Left(ApiException(error)) => assertEquals(error.code, code)
      case other => fail(s"期望 $code，实际 $other")
    }

  private def expectReason(
    action: IO[?],
    code: ErrorCode,
    reason: ValidationReason | ConflictReason
  ): IO[Unit] =
    val expected = reason match
      case value: ValidationReason => ValidationReason.toString(value)
      case value: ConflictReason => ConflictReason.toString(value)
    action.attempt.map {
      case Left(ApiException(error)) =>
        assertEquals(error.code, code)
        assertEquals(error.details.flatMap(_.apply("reason")).flatMap(_.asString), Some(expected))
      case other => fail(s"期望 $code($expected)，实际 $other")
    }
