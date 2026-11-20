package services.gallery.api

import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.nio.file.{Files, Path}
import javax.imageio.ImageIO
import java.time.Instant
import java.util.UUID

import cats.effect.IO
import cats.effect.unsafe.implicits.global
import cats.syntax.all.*

import services.curation.objects.{PhotoAnalysis, PhotoAnalysisRecord}
import services.curation.tables.{PhotoAnalysisTable, PhotoAnalysisTableInitializer}
import services.gallery.objects.{
  CoverKind,
  Exhibition,
  ExhibitionGroup,
  ExhibitionId,
  ExhibitionPhoto,
  GroupId,
  PhotoId,
  PhotoFormat,
  PhotoVariant
}
import services.gallery.objects.apiTypes.{ExhibitionPhotoInput, GroupInput}
import services.gallery.tables.{
  ExhibitionGroupTable,
  ExhibitionGroupTableInitializer,
  ExhibitionPhotoTable,
  ExhibitionPhotoTableInitializer,
  ExhibitionTable,
  ExhibitionTableInitializer,
  PhotoLocationTableInitializer,
  PublicationTable,
  PublicationTableInitializer
}
import services.gallery.utils.{CoverRenderFiles, PhotoStorage}
import services.scene.objects.{SceneBrief, SceneRun, SceneRunId, SceneRunStatus, SceneSource}
import services.scene.tables.{SceneRunTable, SceneRunTableInitializer}
import services.system.api.{ApiException, ErrorCode, ValidationReason}
import services.system.config.{AppConfig, DotEnv}
import services.system.db.{Database, Sql, SqlValue, Transaction}
import services.system.startup.AppRuntime
import services.users.objects.UserId

class PublicationSpec extends munit.FunSuite:
  test("发布快照：首次 v1、公开读冻结、再发布 v2 旧 active superseded、校验/回滚、归档与公开读权限") {
    (for
      dotEnv <- DotEnv.load(Path.of(".env"))
      config <- IO.fromEither(AppConfig.load(dotEnv ++ sys.env).left.map(message => new IllegalStateException(message)))
      dataDirectory = Files.createTempDirectory("momentarium-publication-")
      _ <- Database
             .resource(config.database)
             .use { database =>
               for
                 _ <- initializeTables(database)
                 _ <- AppRuntime.initialize(config.copy(dataDir = dataDirectory), database)
                 _ <- runScenario(database, dataDirectory)
               yield ()
             }
             .guarantee(deleteDirectory(dataDirectory))
    yield ()).unsafeRunSync()
  }

  private def runScenario(database: Database, dataDirectory: Path): IO[Unit] =
    val ownerId = UserId(UUID.randomUUID())
    val strangerId = UserId(UUID.randomUUID())
    val now = Instant.parse("2026-10-27T12:00:00Z")
    val exhibitionId = ExhibitionId(UUID.randomUUID())
    val groupId = GroupId(UUID.randomUUID())
    val photos = List(photoOf(exhibitionId, groupId, 1, now), photoOf(exhibitionId, groupId, 2, now), photoOf(exhibitionId, groupId, 3, now))
    val exhibition = exhibitionOf(exhibitionId, ownerId, "海边的记忆", now)
    val renderKey = UUID.randomUUID()
    val renderStorageKey = CoverRenderFiles.storageKey(exhibitionId, renderKey, PhotoFormat.Jpeg)
    val firstRun = succeededRun(ownerId, exhibitionId, photos.map(_.id), curationVersion = 1, now)

    val scenario = for
      _ <- database.use { connection =>
             for
               _ <- ExhibitionTable.insert(connection, exhibition)
               _ <- ExhibitionGroupTable.insert(connection, ExhibitionGroup(groupId, exhibitionId, "章一", "", 0))
               _ <- photos.traverse_(photo => ExhibitionPhotoTable.insert(connection, photo))
               _ <- photos.traverse_(photo => PhotoStorage.write(dataDirectory, photo.storageKey, if photo.id == photos(1).id then secondJpeg else sampleJpeg))
               _ <- PhotoStorage.write(dataDirectory, renderStorageKey, validJpeg)
               _ <- photos.traverse_(photo => PhotoStorage.write(dataDirectory, photo.thumbKey, sampleJpeg))
               // 公开读取只走展示副本：测试里直接写入与预期内容一致的副本字节。
               _ <- photos.traverse_(photo =>
                      PhotoStorage.write(
                        dataDirectory,
                        PhotoStorage.displayKey(exhibitionId, photo.id),
                        if photo.id == photos(1).id then secondJpeg else sampleJpeg
                      )
                    )
               _ <- SceneRunTable.insert(connection, firstRun)
               _ <- ExhibitionTable.setCurrentSceneRun(connection, exhibitionId, firstRun.id, now)
               _ <- PhotoAnalysisTable.upsert(connection, PhotoAnalysisRecord(photos.head.id, seaAnalysis, "fake-vision", now))
             yield ()
           }

      _ <- assertApiError(
             database.use(connection => GetPublishedExhibitionMessage(exhibitionId).plan(connection)),
             ErrorCode.NotFound,
             "未发布展览公开读"
           )

      published <- database.use(connection => PublishExhibitionMessage(ownerId, exhibitionId).plan(connection))
      _ <- IO(assertEquals(published.version, 1))
      active <- database.use(connection => PublicationTable.findActive(connection, exhibitionId))
      _ <- IO(assert(active.isDefined, "应有 active 快照"))
      snapshot = active.get.snapshot
      _ <- IO(assertEquals(snapshot.version, 1))
      _ <- IO(assertEquals(snapshot.title, "海边的记忆"))
      _ <- IO(assertEquals(snapshot.narration, "沿着微弱的光走进这些照片。"))
      _ <- IO(assertEquals(snapshot.groups.map(_.title), List("章一")))
      _ <- IO(assertEquals(snapshot.groups.head.photoIds, photos.map(_.id)))
      _ <- IO(assertEquals(snapshot.sceneRunId, Some(firstRun.id)))
      _ <- IO(assertEquals(snapshot.scenePalette, Some(List("#0B1020"))))
      _ <- IO(assertEquals(snapshot.photos.map(_.reading.map(_.poeticLine)), List(Some(seaAnalysis.suggestedCaption), None, None)))

      publicView <- database.use(connection => GetPublishedExhibitionMessage(exhibitionId).plan(connection))
      _ <- IO(assertEquals(publicView.version, 1))
      _ <- IO(assertEquals(publicView.title, "海边的记忆"))
      _ <- IO(assertEquals(publicView.groups.size, 1))
      _ <- IO(assertEquals(publicView.photos.map(_.id), photos.map(_.id)))
      _ <- IO(assertEquals(publicView.scenePalette, List("#0B1020")))
      _ <- IO(assertEquals(publicView.photos.head.reading.map(_.palette), Some(seaAnalysis.palette)))
      _ <- IO(assertEquals(publicView.cover.kind, CoverKind.Auto))
      _ <- IO(assertEquals(publicView.cover.imageUrl, s"/api/exhibitions/${exhibitionId.value}/cover"))

      // 三种封面均保持策展版本，已有成功场景仍然有效。
      _ <- database.use(connection => SetCoverMessage(ownerId, exhibitionId, CoverKind.Render, None, Some(renderKey.toString)).plan(connection))
      renderVersion <- database.use(connection => ExhibitionTable.findById(connection, exhibitionId))
      renderDetail <- database.use(connection => GetExhibitionMessage(ownerId, exhibitionId).plan(connection))
      _ <- IO(assertEquals(renderVersion.map(_.curationVersion), Some(1)))
      _ <- IO(assertEquals(renderDetail.sceneStale, false))
      _ <- database.use(connection => SetCoverMessage(ownerId, exhibitionId, CoverKind.Auto, None, None).plan(connection))
      autoVersion <- database.use(connection => ExhibitionTable.findById(connection, exhibitionId))
      autoDetail <- database.use(connection => GetExhibitionMessage(ownerId, exhibitionId).plan(connection))
      _ <- IO(assertEquals(autoVersion.map(_.curationVersion), Some(1)))
      _ <- IO(assertEquals(autoDetail.sceneStale, false))
      // 仅更换封面不使成功场景过期，公开快照继续冻结直到重新发布。
      _ <- database.use(connection => SetCoverMessage(ownerId, exhibitionId, CoverKind.Photo, Some(photos(1).id), None).plan(connection))
      photoVersion <- database.use(connection => ExhibitionTable.findById(connection, exhibitionId))
      _ <- IO(assertEquals(photoVersion.map(_.curationVersion), Some(1)))
      coverDetail <- database.use(connection => GetExhibitionMessage(ownerId, exhibitionId).plan(connection))
      _ <- IO(assertEquals(coverDetail.hasUnpublishedChanges, true))
      _ <- IO(assertEquals(coverDetail.sceneStale, false))
      oldCover <- database.use(connection => GetExhibitionCoverMessage(None, exhibitionId, dataDirectory).plan(connection))
      _ <- IO(assertEquals(oldCover.bytes.toList, sampleJpeg.toList))
      coverPublication <- database.use(connection => PublishExhibitionMessage(ownerId, exhibitionId).plan(connection))
      _ <- IO(assertEquals(coverPublication.version, 2))
      newCover <- database.use(connection => GetExhibitionCoverMessage(None, exhibitionId, dataDirectory).plan(connection))
      _ <- IO(assertEquals(newCover.bytes.toList, secondJpeg.toList))
      _ <- IO(assertNotEquals(newCover.bytes.toList, oldCover.bytes.toList))
      updatedSnapshot <- database.use(connection => PublicationTable.findActive(connection, exhibitionId))
      _ <- IO(assertEquals(updatedSnapshot.map(_.snapshot.cover.kind), Some(CoverKind.Photo)))
      // 编辑草稿（图注 + 叙事）→ 公开读仍冻结；再补一条匹配新版本的成功运行后可再次发布
      _ <- database.use(connection =>
             UpdateCurationMessage(
               ownerId,
               exhibitionId,
               "海边的记忆",
               "更新后的叙事",
               List(GroupInput("章一", "", photos.map(photo => ExhibitionPhotoInput(photo.id, "新图注"))))
             ).plan(connection)
           )
      frozen <- database.use(connection => GetPublishedExhibitionMessage(exhibitionId).plan(connection))
      _ <- IO(assertEquals(frozen.title, "海边的记忆"))
      _ <- IO(assertEquals(frozen.narrative, ""))
      ownerDetail <- database.use(connection => GetExhibitionMessage(ownerId, exhibitionId).plan(connection))
      _ <- IO(assertEquals(ownerDetail.publication.map(_.version), Some(2)))
      _ <- IO(assertEquals(ownerDetail.hasUnpublishedChanges, true))
      _ <- IO(assertEquals(ownerDetail.sceneRun.map(_.runId), Some(firstRun.id)))

      currentExhibition <- database.use(connection => ExhibitionTable.findById(connection, exhibitionId))
      secondRun = succeededRun(
                    ownerId,
                    exhibitionId,
                    photos.map(_.id),
                    curationVersion = currentExhibition.get.curationVersion,
                    now.plusSeconds(60)
                  )
      _ <- database.use(connection =>
             SceneRunTable.insert(connection, secondRun) *>
               ExhibitionTable.setCurrentSceneRun(connection, exhibitionId, secondRun.id, now.plusSeconds(60))
           )

      republished <- database.use(connection => PublishExhibitionMessage(ownerId, exhibitionId).plan(connection))
      _ <- IO(assertEquals(republished.version, 3))
      statuses <- database.use(connection =>
                    Sql.query[String](
                      connection,
                      "SELECT status FROM gallery.publications WHERE exhibition_id = ? ORDER BY version",
                      List(SqlValue.Uuid(exhibitionId.value))
                    )
                  )
      _ <- IO(assertEquals(statuses, List("superseded", "superseded", "active")))
      v2View <- database.use(connection => GetPublishedExhibitionMessage(exhibitionId).plan(connection))
      _ <- IO(assertEquals(v2View.version, 3))
      _ <- IO(assertEquals(v2View.narrative, "更新后的叙事"))
      afterSecond <- database.use(connection => GetExhibitionMessage(ownerId, exhibitionId).plan(connection))
      _ <- IO(assertEquals(afterSecond.hasUnpublishedChanges, false))
      _ <- IO(assertEquals(afterSecond.sceneRun.map(_.runId), Some(secondRun.id)))

      // 草稿再改（版本超前）→ 发布失败 SCENE_STALE，且旧 active 保持 v2
      _ <- database.use(connection =>
             UpdateCurationMessage(
               ownerId,
               exhibitionId,
               "海边的记忆",
               "第三版",
               List(GroupInput("章一", "", photos.map(photo => ExhibitionPhotoInput(photo.id, ""))))
             ).plan(connection)
           )
      _ <- assertValidation(
             database.use(connection => PublishExhibitionMessage(ownerId, exhibitionId).plan(connection)),
             ValidationReason.SceneStale,
             "场景过期发布"
           )
      activeAfterFailure <- database.use(connection => PublicationTable.findActive(connection, exhibitionId))
      _ <- IO(assertEquals(activeAfterFailure.map(_.version), Some(3)))
      _ <- IO(assertEquals(activeAfterFailure.map(_.snapshot.narrative), Some("更新后的叙事")))

      // 归档：删除被 active 快照引用的照片 → 只 archived_at，公开仍可读
      _ <- database.use(connection => DeletePhotoMessage(ownerId, photos.head.id).plan(connection))
      archivedPhoto <- database.use(connection => ExhibitionPhotoTable.findById(connection, photos.head.id))
      _ <- IO(assert(archivedPhoto.exists(_.archivedAt.isDefined), "被快照引用的照片应归档而非删除"))
      _ <- IO(assert(Files.isRegularFile(dataDirectory.resolve(photos.head.storageKey)), "归档照片文件应保留"))
      publicContent <- database.use(connection =>
                         GetPhotoContentMessage(None, photos.head.id, PhotoVariant.Full, dataDirectory).plan(connection)
                       )
      _ <- IO(assertEquals(publicContent.bytes.toList, sampleJpeg.toList))
      strangerRead <- database.use(connection =>
                        GetPhotoContentMessage(Some(strangerId), photos.head.id, PhotoVariant.Full, dataDirectory).plan(connection)
                      )
      _ <- IO(assertEquals(strangerRead.bytes.toList, sampleJpeg.toList))

      // 未被快照引用的新照片 → 物理删除（updatecuration 已重建章节，故用未分组照片）
      extraPhoto = photoOf(exhibitionId, groupId, 9, now, grouped = false)
      _ <- database.use(connection => ExhibitionPhotoTable.insert(connection, extraPhoto))
      _ <- database.use(connection => DeletePhotoMessage(ownerId, extraPhoto.id).plan(connection))
      deletedPhoto <- database.use(connection => ExhibitionPhotoTable.findById(connection, extraPhoto.id))
      _ <- IO(assertEquals(deletedPhoto, None))

      // 公开封面：未发布展览 → 401；已发布 → 快照封面字节
      unpublishedId = ExhibitionId(UUID.randomUUID())
      _ <- database.use(connection => ExhibitionTable.insert(connection, exhibitionOf(unpublishedId, ownerId, "未发布", now)))
      _ <- assertApiError(
             database.use(connection => GetExhibitionCoverMessage(None, unpublishedId, dataDirectory).plan(connection)),
             ErrorCode.Unauthorized,
             "未发布展览匿名封面"
           )
      publicCover <- database.use(connection => GetExhibitionCoverMessage(None, exhibitionId, dataDirectory).plan(connection))
      _ <- IO(assertEquals(publicCover.bytes.toList, secondJpeg.toList))

      _ <- validationScenario(database, ownerId, now)
    yield ()

    scenario.guarantee(
      database
        .use { connection =>
          for
            _ <- Sql.update(
                   connection,
                   "DELETE FROM scene.scene_runs WHERE requested_by = ?",
                   List(SqlValue.Uuid(ownerId.value))
                 )
            // 分析缓存无外键，按本测试随机 photo_id 精确删除，避免全量 suite 残留（task-13 测试卫生）。
            _ <- photos.traverse_(photo =>
                   Sql.update(
                     connection,
                     "DELETE FROM curation.photo_analyses WHERE photo_id = ?",
                     List(SqlValue.Uuid(photo.id.value))
                   )
                 )
            _ <- Sql.update(
                   connection,
                   "DELETE FROM gallery.exhibitions WHERE owner_id = ?",
                   List(SqlValue.Uuid(ownerId.value))
                 )
          yield ()
        }
        .attempt
        .void
    )

  private def validationScenario(database: Database, ownerId: UserId, now: Instant): IO[Unit] =
    val notReadyId = ExhibitionId(UUID.randomUUID())
    val photoCountId = ExhibitionId(UUID.randomUUID())
    val ungroupedId = ExhibitionId(UUID.randomUUID())
    val emptyGroupId = ExhibitionId(UUID.randomUUID())
    val blankTitleId = ExhibitionId(UUID.randomUUID())

    def seed(id: ExhibitionId, title: String, photoCount: Int, grouped: Boolean, emptyGroup: Boolean): IO[Unit] =
      database.use { connection =>
        val groupId = GroupId(UUID.randomUUID())
        val photos = (1 to photoCount).toList.map(index => photoOf(id, groupId, index, now, grouped = grouped))
        for
          _ <- ExhibitionTable.insert(connection, exhibitionOf(id, ownerId, title, now))
          _ <- ExhibitionGroupTable.insert(connection, ExhibitionGroup(groupId, id, "章", "", 0))
          _ <-
            if emptyGroup then
              ExhibitionGroupTable.insert(connection, ExhibitionGroup(GroupId(UUID.randomUUID()), id, "空章", "", 1))
            else IO.unit
          _ <- photos.traverse_(photo => ExhibitionPhotoTable.insert(connection, photo))
        yield ()
      }

    val scenario = for
      _ <- seed(notReadyId, "无场景", 3, grouped = true, emptyGroup = false)
      _ <- assertValidation(
             database.use(connection => PublishExhibitionMessage(ownerId, notReadyId).plan(connection)),
             ValidationReason.SceneNotReady,
             "无 succeeded 场景"
           )
      _ <- seed(photoCountId, "两张", 2, grouped = true, emptyGroup = false)
      _ <- assertValidation(
             database.use(connection => PublishExhibitionMessage(ownerId, photoCountId).plan(connection)),
             ValidationReason.PhotoCount,
             "照片不足 3 张"
           )
      _ <- seed(ungroupedId, "未分组", 3, grouped = false, emptyGroup = false)
      _ <- assertValidation(
             database.use(connection => PublishExhibitionMessage(ownerId, ungroupedId).plan(connection)),
             ValidationReason.PhotoUngrouped,
             "存在未分组照片"
           )
      _ <- seed(emptyGroupId, "空章节", 3, grouped = true, emptyGroup = true)
      _ <- assertValidation(
             database.use(connection => PublishExhibitionMessage(ownerId, emptyGroupId).plan(connection)),
             ValidationReason.GroupEmpty,
             "存在空章节"
           )
      _ <- seed(blankTitleId, "   ", 3, grouped = true, emptyGroup = false)
      _ <- assertValidation(
             database.use(connection => PublishExhibitionMessage(ownerId, blankTitleId).plan(connection)),
             ValidationReason.TitleRequired,
             "标题为空"
           )
      _ <- assertApiError(
             database.use(connection => PublishExhibitionMessage(UserId(UUID.randomUUID()), notReadyId).plan(connection)),
             ErrorCode.NotFound,
             "他人发布"
           )
    yield ()

    scenario.guarantee(
      database
        .use { connection =>
          Sql.update(
            connection,
            "DELETE FROM gallery.exhibitions WHERE id IN (?, ?, ?, ?, ?)",
            List(notReadyId, photoCountId, ungroupedId, emptyGroupId, blankTitleId).map(id => SqlValue.Uuid(id.value))
          )
        }
        .attempt
        .void
    )

  private def initializeTables(database: Database): IO[Unit] =
    val initializers = List(
      ExhibitionTableInitializer.initialize,
      ExhibitionGroupTableInitializer.initialize,
      ExhibitionPhotoTableInitializer.initialize,
      PhotoLocationTableInitializer.initialize,
      PublicationTableInitializer.initialize,
      SceneRunTableInitializer.initialize,
      PhotoAnalysisTableInitializer.initialize
    )
    database.use(connection => Transaction(connection)(initializers.traverse_(initialize => initialize(connection))))

  private def exhibitionOf(id: ExhibitionId, ownerId: UserId, title: String, now: Instant): Exhibition =
    Exhibition(
      id = id,
      ownerId = ownerId,
      title = title,
      narrative = "",
      curationVersion = 1,
      coverKind = CoverKind.Auto,
      coverPhotoId = None,
      coverStorageKey = None,
      coverMime = None,
      coverWidth = None,
      coverHeight = None,
      createdAt = now,
      updatedAt = now
    )

  private def photoOf(
    exhibitionId: ExhibitionId,
    groupId: GroupId,
    index: Int,
    now: Instant,
    grouped: Boolean = true
  ): ExhibitionPhoto =
    ExhibitionPhoto(
      id = PhotoId(UUID.randomUUID()),
      exhibitionId = exhibitionId,
      storageKey = s"${exhibitionId.value}/photo-$index.jpg",
      thumbKey = s"${exhibitionId.value}/photo-$index.thumb.jpg",
      originalName = s"photo-$index.jpg",
      mime = "image/jpeg",
      width = Some(1024),
      height = Some(683),
      groupId = if grouped then Some(groupId) else None,
      positionInGroup = if grouped then Some(index) else None,
      caption = s"图注 $index",
      archivedAt = None,
      createdAt = now
    )

  private def succeededRun(
    ownerId: UserId,
    exhibitionId: ExhibitionId,
    photoIds: List[PhotoId],
    curationVersion: Int,
    createdAt: Instant
  ): SceneRun =
    SceneRun(
      id = SceneRunId(UUID.randomUUID()),
      exhibitionId = exhibitionId,
      requestedBy = ownerId,
      status = SceneRunStatus.Succeeded,
      source = Some(SceneSource.Ai),
      hint = None,
      photoIds = photoIds,
      curationVersion = curationVersion,
      runtimeVersion = "1",
      brief = Some(
        SceneBrief(
          mood = "安静的眷恋",
          memoryReading = "海边的光。",
          scenePrompt = "用 Three.js 生成场景。",
          entranceNarration = "沿着微弱的光走进这些照片。",
          palette = List("#0B1020"),
          avoid = Nil,
          userHint = None
        )
      ),
      code = Some("function build(ctx) {}"),
      review = None,
      runtimeEvidence = None,
      attempts = 0,
      promptVersion = "scene-parent-v1",
      errorCode = None,
      errorMessage = None,
      createdAt = createdAt,
      updatedAt = createdAt
    )

  private val seaAnalysis: PhotoAnalysis =
    PhotoAnalysis("黄昏的海", "怀念", List("#1B2A4A", "#F2A65A"), List("潮声"), "咸湿的风", "浪把黄昏揉碎在黑石上")

  private def secondJpeg: Array[Byte] = sampleJpeg ++ Array[Byte](0x42)

  private def validJpeg: Array[Byte] =
    val output = new ByteArrayOutputStream()
    ImageIO.write(new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB), "jpg", output)
    output.toByteArray
  private val sampleJpeg: Array[Byte] =
    Array[Byte](0xff.toByte, 0xd8.toByte, 0xff.toByte, 0xe0.toByte, 0x00, 0x10, 0x4a, 0x46)

  private def assertValidation(action: IO[?], reason: ValidationReason, context: String): IO[Unit] =
    action.attempt.map {
      case Left(ApiException(error)) =>
        assertEquals(error.code, ErrorCode.Validation, context)
        assertEquals(
          error.details.flatMap(_.apply("reason")).flatMap(_.asString),
          Some(ValidationReason.toString(reason)),
          context
        )
      case other => fail(s"$context 期望 VALIDATION(${ValidationReason.toString(reason)})，实际: $other")
    }

  private def assertApiError(action: IO[?], expectedCode: ErrorCode, context: String): IO[Unit] =
    action.attempt.map {
      case Left(ApiException(error)) => assertEquals(error.code, expectedCode, context)
      case other => fail(s"$context 期望 $expectedCode，实际: $other")
    }

  private def deleteDirectory(directory: Path): IO[Unit] =
    IO.blocking {
      import scala.jdk.CollectionConverters.*
      Files.walk(directory).iterator().asScala.toList.reverse.foreach(Files.deleteIfExists)
    }
