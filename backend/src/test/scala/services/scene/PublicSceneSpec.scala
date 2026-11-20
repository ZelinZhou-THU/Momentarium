package services.scene

import java.util.UUID

import cats.effect.IO
import io.circe.syntax.*

import munit.CatsEffectSuite

import services.gallery.objects.*
import services.gallery.tables.PublicationTable
import services.scene.api.GetPublishedSceneMessage
import services.scene.objects.*
import services.scene.objects.apiTypes.{GetPublishedSceneRequest, PublishedSceneResponse}
import services.scene.routes.SceneRoutes
import services.scene.tables.SceneRunTable
import services.system.api.{ApiException, ErrorCode}
import services.users.objects.UserId

/**
 * getpublishedscene（api-contract §4.2 / spec §6.1）：公开、无令牌，只读 active 发布快照绑定的 succeeded run。
 * 覆盖：正常字段、无/非 active 发布、快照未绑定场景、run 非 succeeded、code 空、run 不存在、跨展览串用、路由层无令牌访问。
 */
class PublicSceneSpec extends CatsEffectSuite with SceneTestSupport:

  test("active 快照 + succeeded run → 200，code/runtimeVersion/generatedAt（run.updatedAt）正确") {
    withDatabase { (_, connection, _) =>
      for
        (userId, exhibitionId, photos) <- seedExhibition(connection)
        run <- insertRun(connection, userId, exhibitionId, photos, SceneRunStatus.Succeeded)
        _ <- insertPublication(connection, exhibitionId, snapshot(sceneRunId = Some(run.id)))
        response <- GetPublishedSceneMessage(exhibitionId).plan(connection)
        _ = assertEquals(response.code, SampleCode)
        _ = assertEquals(response.runtimeVersion, run.runtimeVersion)
        _ = assertEquals(response.generatedAt, run.updatedAt, "generatedAt 口径 = run.updatedAt（评审通过时刻）")
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("无 active 发布 → 404；superseded 不算公开") {
    withDatabase { (_, connection, _) =>
      for
        (userId, exhibitionId, photos) <- seedExhibition(connection)
        run <- insertRun(connection, userId, exhibitionId, photos, SceneRunStatus.Succeeded)
        _ <- insertPublication(
               connection,
               exhibitionId,
               snapshot(sceneRunId = Some(run.id)),
               status = PublicationStatus.Superseded
             )
        _ <- expectNotFound(GetPublishedSceneMessage(exhibitionId).plan(connection))
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("active 快照未绑定 sceneRunId / 绑定到不存在的 run → 404") {
    withDatabase { (_, connection, _) =>
      for
        (_, exhibitionId, _) <- seedExhibition(connection)
        _ <- replaceActive(connection, exhibitionId, snapshot(sceneRunId = None))
        _ <- expectNotFound(GetPublishedSceneMessage(exhibitionId).plan(connection))
        missingRunId <- IO.randomUUID.map(SceneRunId.apply)
        _ <- replaceActive(connection, exhibitionId, snapshot(sceneRunId = Some(missingRunId)), version = 2)
        _ <- expectNotFound(GetPublishedSceneMessage(exhibitionId).plan(connection))
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("快照绑定的 run 非 succeeded（failed/cancelled/awaiting_capture）→ 404") {
    withDatabase { (_, connection, _) =>
      for
        (userId, exhibitionId, photos) <- seedExhibition(connection)
        failed <- insertRun(connection, userId, exhibitionId, photos, SceneRunStatus.Failed, code = None)
        _ <- replaceActive(connection, exhibitionId, snapshot(sceneRunId = Some(failed.id)), version = 1)
        _ <- expectNotFound(GetPublishedSceneMessage(exhibitionId).plan(connection))
        cancelled <- insertRun(connection, userId, exhibitionId, photos, SceneRunStatus.Cancelled, code = None)
        _ <- replaceActive(connection, exhibitionId, snapshot(sceneRunId = Some(cancelled.id)), version = 2)
        _ <- expectNotFound(GetPublishedSceneMessage(exhibitionId).plan(connection))
        awaiting <- insertRun(connection, userId, exhibitionId, photos, SceneRunStatus.AwaitingCapture)
        _ <- replaceActive(connection, exhibitionId, snapshot(sceneRunId = Some(awaiting.id)), version = 3)
        _ <- expectNotFound(GetPublishedSceneMessage(exhibitionId).plan(connection))
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("succeeded 但 code 为空/空白 → 404（不返回不可渲染场景）") {
    withDatabase { (_, connection, _) =>
      for
        (userId, exhibitionId, photos) <- seedExhibition(connection)
        withoutCode <- insertRun(connection, userId, exhibitionId, photos, SceneRunStatus.Succeeded, code = None)
        _ <- replaceActive(connection, exhibitionId, snapshot(sceneRunId = Some(withoutCode.id)), version = 1)
        _ <- expectNotFound(GetPublishedSceneMessage(exhibitionId).plan(connection))
        blankCode <- insertRun(connection, userId, exhibitionId, photos, SceneRunStatus.Succeeded, code = Some("   "))
        _ <- replaceActive(connection, exhibitionId, snapshot(sceneRunId = Some(blankCode.id)), version = 2)
        _ <- expectNotFound(GetPublishedSceneMessage(exhibitionId).plan(connection))
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("快照指向其它展览的 run（数据串用）→ 404，不泄露他人场景") {
    withDatabase { (_, connection, _) =>
      for
        seedA <- seedExhibition(connection)
        userA = seedA._1
        exhibitionA = seedA._2
        photosA = seedA._3
        seedB <- seedExhibition(connection)
        userB = seedB._1
        exhibitionB = seedB._2
        photosB = seedB._3
        otherRun <- insertRun(connection, userB, exhibitionB, photosB, SceneRunStatus.Succeeded)
        _ <- insertPublication(connection, exhibitionA, snapshot(sceneRunId = Some(otherRun.id)))
        _ <- expectNotFound(GetPublishedSceneMessage(exhibitionA).plan(connection))
        _ <- cleanup(connection, exhibitionA)
        _ <- cleanup(connection, exhibitionB)
      yield ()
    }
  }

  test("展览不存在或从未发布 → 404") {
    withDatabase { (_, connection, _) =>
      for
        missing <- IO.randomUUID.map(ExhibitionId.apply)
        _ <- expectNotFound(GetPublishedSceneMessage(missing).plan(connection))
        (_, exhibitionId, _) <- seedExhibition(connection)
        _ <- expectNotFound(GetPublishedSceneMessage(exhibitionId).plan(connection))
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  test("路由层：getpublishedscene 公开（无需令牌、不解析令牌），响应为契约形状 JSON") {
    withDatabase { (_, connection, _) =>
      for
        (userId, exhibitionId, photos) <- seedExhibition(connection)
        run <- insertRun(connection, userId, exhibitionId, photos, SceneRunStatus.Succeeded)
        _ <- insertPublication(connection, exhibitionId, snapshot(sceneRunId = Some(run.id)))
        route <- IO.fromOption(SceneRoutes.apiMessages.find(_.routeName == "getpublishedscene"))(
                   new IllegalStateException("SceneRoutes 未注册 getpublishedscene")
                 )
        json <- route.handle(
                  connection = connection,
                  token = None,
                  body = GetPublishedSceneRequest(exhibitionId).asJson,
                  resolveUserId = _ => IO.raiseError(new IllegalStateException("公开路由不应解析令牌"))
                )
        _ = assert(route.requiresRequestBody, "getpublishedscene 需要请求体")
        _ = assertEquals(json.hcursor.get[String]("code").toOption, Some(SampleCode))
        _ = assert(json.hcursor.get[String]("runtimeVersion").toOption.exists(_.nonEmpty))
        _ = assert(json.hcursor.get[String]("generatedAt").toOption.exists(_.nonEmpty))
        _ = assertEquals(
              json.as[PublishedSceneResponse],
              Right(
                PublishedSceneResponse(SampleCode, run.runtimeVersion, run.updatedAt)
              )
            )
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }

  // ---------- 辅助 ----------

  private def insertRun(
    connection: java.sql.Connection,
    userId: UserId,
    exhibitionId: ExhibitionId,
    photos: List[ExhibitionPhoto],
    status: SceneRunStatus,
    code: Option[String] = Some(SampleCode)
  ): IO[SceneRun] =
    for
      run <- newRun(
               userId,
               exhibitionId,
               photos,
               status = status,
               source = if status == SceneRunStatus.Succeeded then Some(SceneSource.Ai) else None,
               brief = Some(sampleBrief()),
               code = code
             )
      _ <- SceneRunTable.insert(connection, run)
    yield run

  private def snapshot(sceneRunId: Option[SceneRunId]): PublicationSnapshot =
    PublicationSnapshot(
      version = 1,
      publishedAt = TestNow,
      curationVersion = 1,
      title = "济州的三天",
      narrative = "从海边到山里的三天。",
      narration = "沿着潮声走进去。",
      cover = SnapshotCover(CoverKind.Auto, None, None, None, None, 0, 0),
      groups = Nil,
      photos = Nil,
      sceneRunId = sceneRunId,
      sceneCode = sceneRunId.map(_ => SampleCode),
      sceneRuntimeVersion = Some("1"),
      sceneGeneratedAt = Some(TestNow),
      scenePalette = None
    )

  private def insertPublication(
    connection: java.sql.Connection,
    exhibitionId: ExhibitionId,
    snapshot: PublicationSnapshot,
    status: PublicationStatus = PublicationStatus.Active,
    version: Int = 1
  ): IO[Unit] =
    for
      publicationId <- IO.randomUUID.map(PublicationId.apply)
      publication = Publication(
                      id = publicationId,
                      exhibitionId = exhibitionId,
                      version = version,
                      snapshot = snapshot,
                      status = status,
                      createdAt = TestNow,
                      supersededAt = if status == PublicationStatus.Superseded then Some(TestNow) else None
                    )
      _ <- PublicationTable.insert(connection, publication)
    yield ()

  /** 同一展览最多一个 active（部分唯一索引）：逐步替换时先 supersede 旧的 active。 */
  private def replaceActive(
    connection: java.sql.Connection,
    exhibitionId: ExhibitionId,
    snapshot: PublicationSnapshot,
    version: Int = 1
  ): IO[Unit] =
    PublicationTable.supersedeActive(connection, exhibitionId, TestNow) *>
      insertPublication(connection, exhibitionId, snapshot, PublicationStatus.Active, version)

  private def expectNotFound(io: IO[PublishedSceneResponse]): IO[Unit] =
    io.attempt.flatMap {
      case Left(ApiException(error)) => IO(assertEquals(error.code, ErrorCode.NotFound))
      case Left(other) => IO.raiseError(other)
      case Right(response) => IO(fail(s"期望 404 NOT_FOUND，但成功返回：$response"))
    }
