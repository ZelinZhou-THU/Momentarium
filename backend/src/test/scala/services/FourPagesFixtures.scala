package services

import java.nio.file.Path
import java.time.Instant
import java.util.UUID

import cats.effect.IO
import cats.syntax.all.*

import services.curation.tables.PhotoAnalysisTableInitializer
import services.gallery.objects.*
import services.gallery.tables.*
import services.scene.objects.*
import services.scene.tables.SceneRunTableInitializer
import services.system.config.{AppConfig, DotEnv}
import services.system.db.{Database, Transaction}
import services.users.objects.UserId
import services.users.tables.{ProfileTableInitializer, SessionTableInitializer, UserTableInitializer}

/** 四个新页面集成测试共用的建表与样本构造（真实测试库，随机 id 互不干扰）。 */
object FourPagesFixtures:
  val t0: Instant = Instant.parse("2026-10-01T08:00:00Z")

  def withDatabase(body: Database => IO[Unit]): IO[Unit] =
    for
      dotEnv <- DotEnv.load(Path.of(".env"))
      config <- IO.fromEither(AppConfig.load(dotEnv ++ sys.env).left.map(message => new IllegalStateException(message)))
      _ <- Database.resource(config.database).use(database => initializeTables(database) *> body(database))
    yield ()

  private def initializeTables(database: Database): IO[Unit] =
    val initializers = List(
      UserTableInitializer.initialize,
      SessionTableInitializer.initialize,
      ProfileTableInitializer.initialize,
      PhotoAnalysisTableInitializer.initialize,
      ExhibitionTableInitializer.initialize,
      ExhibitionGroupTableInitializer.initialize,
      ExhibitionPhotoTableInitializer.initialize,
      PhotoLocationTableInitializer.initialize,
      PublicationTableInitializer.initialize,
      SceneRunTableInitializer.initialize
    )
    database.use(connection => Transaction(connection)(initializers.traverse_(initialize => initialize(connection))))

  def exhibition(id: ExhibitionId, owner: UserId, title: String): Exhibition =
    Exhibition(
      id = id,
      ownerId = owner,
      title = title,
      narrative = "",
      curationVersion = 1,
      coverKind = CoverKind.Auto,
      coverPhotoId = None,
      coverStorageKey = None,
      coverMime = None,
      coverWidth = None,
      coverHeight = None,
      createdAt = t0,
      updatedAt = t0
    )

  def photo(exhibitionId: ExhibitionId, groupId: GroupId, index: Int, archived: Boolean = false): ExhibitionPhoto =
    ExhibitionPhoto(
      id = PhotoId(UUID.randomUUID()),
      exhibitionId = exhibitionId,
      storageKey = s"${exhibitionId.value}/photo-$index.jpg",
      thumbKey = s"${exhibitionId.value}/photo-$index.thumb.jpg",
      originalName = s"photo-$index.jpg",
      mime = "image/jpeg",
      width = Some(1024),
      height = Some(683),
      groupId = Some(groupId),
      positionInGroup = Some(index),
      caption = "",
      archivedAt = if archived then Some(t0) else None,
      createdAt = t0
    )

  def succeededRun(
    owner: UserId,
    exhibitionId: ExhibitionId,
    photoIds: List[PhotoId],
    createdAt: Instant,
    mood: String,
    runtimeVersion: String
  ): SceneRun =
    SceneRun(
      id = SceneRunId(UUID.randomUUID()),
      exhibitionId = exhibitionId,
      requestedBy = owner,
      status = SceneRunStatus.Succeeded,
      source = Some(SceneSource.Ai),
      hint = None,
      photoIds = photoIds,
      curationVersion = 1,
      runtimeVersion = runtimeVersion,
      brief = Some(SceneBrief(mood, "海边的光。", "题面", "导语", List("#0B1020"), Nil, None)),
      code = Some(s"function build(ctx) { /* $mood */ }"),
      review = Some(SceneReview(RubricScores(4, 3, 4, 4, 3), ReviewVerdict.Pass, Nil, "成立")),
      runtimeEvidence = None,
      attempts = 0,
      promptVersion = "scene-parent-v3.2",
      errorCode = None,
      errorMessage = None,
      createdAt = createdAt,
      updatedAt = createdAt
    )
