package services.curation

import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.nio.file.{Files, Path}
import java.sql.Connection
import java.time.Instant
import java.util.UUID
import javax.imageio.ImageIO

import cats.effect.{IO, Resource}
import cats.syntax.all.*

import munit.CatsEffectSuite

import services.curation.api.{GetChatHistoryMessage, RefineCurationMessage, SuggestThemesMessage}
import services.curation.objects.ChatRole
import services.curation.objects.apiTypes.{ChatHistoryResponse, RefineCurationResponse, ThemeSuggestionsResponse}
import services.curation.tables.{ChatMessageTableInitializer, ChatSessionTableInitializer, PhotoAnalysisTableInitializer}
import services.gallery.objects.*
import services.gallery.tables.*
import services.system.ai.AiRuntime
import services.system.api.{ApiException, ErrorCode}
import services.system.config.{AppConfig, DotEnv}
import services.system.db.{Database, Sql, SqlValue}
import services.system.startup.AppRuntime
import services.users.objects.UserId

/**
 * curation 三条 API 的 Fake 全链路（真实表在 momentarium_ai）：
 * 种子展览/章节/照片与临时图片文件 → AiRuntime(fake) + AppRuntime → suggestthemes → refinecuration → getchathistory。
 * 只写 momentarium_ai，不触碰 momentarium_platform；随机 ID，结束清理。
 */
class CurationApiSpec extends CatsEffectSuite:

  private val now = Instant.parse("2026-10-27T12:00:00Z")
  private val aiDatabaseUrl = sys.env.getOrElse("TEST_AI_DB_URL", "jdbc:postgresql://localhost:5432/momentarium_ai")
  private val instruction = "把海边那几张放前面，图注改短一点"

  test("suggest → refine → getchathistory 全链路（Fake AI + momentarium_ai 真实表）") {
    temporaryDataDirectory.use { dataDirectory =>
      for
        config <- loadConfig(dataDirectory)
        _ <- AiRuntime.initialize(config.ai)
        _ <- Database.resource(config.database).use { database =>
               for
                 _ <- AppRuntime.initialize(config, database)
                 _ <- database.use { connection =>
                        for
                          _ <- initSchemas(connection)
                          seeded <- seedExhibition(connection, dataDirectory)
                          (userId, exhibitionId, photos) = seeded
                          suggestions <- SuggestThemesMessage(userId, exhibitionId, Some("想要安静一点")).plan(connection)
                          refined <- RefineCurationMessage(userId, exhibitionId, instruction).plan(connection)
                          history <- GetChatHistoryMessage(userId, exhibitionId).plan(connection)
                          denied <- GetChatHistoryMessage(UserId(UUID.randomUUID()), exhibitionId).plan(connection).attempt
                          _ <- assertFlow(photos, suggestions, refined, history, denied)
                          _ <- cleanup(connection, exhibitionId, photos.map(_.id))
                        yield ()
                      }
               yield ()
             }
      yield ()
    }
  }

  private def assertFlow(
    photos: List[ExhibitionPhoto],
    suggestions: ThemeSuggestionsResponse,
    refined: RefineCurationResponse,
    history: ChatHistoryResponse,
    denied: Either[Throwable, ChatHistoryResponse]
  ): IO[Unit] =
    IO {
      val photoIdSet = photos.map(_.id).toSet
      assertEquals(suggestions.proposals.size, 2, "fake 提示词示例应产出 2 个方案")
      suggestions.proposals.foreach { proposal =>
        assertEquals(proposal.groups.flatMap(_.photoIds).toSet, photoIdSet, "每个方案必须覆盖全部照片")
        assertEquals(proposal.groups.flatMap(_.photoIds).size, photoIdSet.size, "同一方案内照片不得重复")
      }
      assert(refined.reply.nonEmpty, "reply 不能为空")
      val proposedPhotoIds = refined.proposal.groups.flatMap(_.photos.map(_.photoId))
      assert(proposedPhotoIds.nonEmpty, "修订提案必须包含照片")
      assert(proposedPhotoIds.toSet.subsetOf(photoIdSet), "修订提案只能使用展览现有照片")
      assert(
        refined.proposal.groups.head.title.endsWith("·修订"),
        s"fake 修订示例应给章节加·修订标记，实际：${refined.proposal.groups.head.title}"
      )
      assertEquals(
        proposedPhotoIds,
        photos.map(_.id).reverse,
        "fake 修订示例应反转照片顺序，让「结构变化」在 D3 Gate 可观察"
      )
      assertEquals(history.messages.size, 2, "refine 落一条 user + 一条 assistant")
      assertEquals(history.messages.head.role, ChatRole.User)
      assertEquals(history.messages.head.content, instruction)
      assertEquals(history.messages(1).role, ChatRole.Assistant)
      denied match
        case Left(ApiException(error)) => assertEquals(error.code, ErrorCode.NotFound)
        case other => fail(s"非作者读取对话应返回 NOT_FOUND，实际：$other")
    }

  private def initSchemas(connection: Connection): IO[Unit] =
    for
      _ <- ExhibitionTableInitializer.initialize(connection)
      _ <- ExhibitionGroupTableInitializer.initialize(connection)
      _ <- ExhibitionPhotoTableInitializer.initialize(connection)
      _ <- PhotoAnalysisTableInitializer.initialize(connection)
      _ <- ChatSessionTableInitializer.initialize(connection)
      _ <- ChatMessageTableInitializer.initialize(connection)
    yield ()

  private def seedExhibition(
    connection: Connection,
    dataDirectory: Path
  ): IO[(UserId, ExhibitionId, List[ExhibitionPhoto])] =
    for
      userId <- IO.randomUUID.map(UserId.apply)
      exhibitionId = ExhibitionId(UUID.randomUUID())
      groupId = GroupId(UUID.randomUUID())
      photoIds <- List.fill(3)(IO.randomUUID.map(PhotoId.apply)).sequence
      jpeg <- sampleJpegBytes
      exhibition = Exhibition(
        id = exhibitionId,
        ownerId = userId,
        title = "济州的三天",
        narrative = "从海边到山里的三天，记住风和光。",
        curationVersion = 0,
        coverKind = CoverKind.Auto,
        coverPhotoId = None,
        coverStorageKey = None,
        coverMime = None,
        coverWidth = None,
        coverHeight = None,
        createdAt = now,
        updatedAt = now
      )
      group = ExhibitionGroup(groupId, exhibitionId, "海边的黄昏", "第一天的记忆", 0)
      photos = photoIds.zipWithIndex.map { case (photoId, index) =>
                 ExhibitionPhoto(
                   id = photoId,
                   exhibitionId = exhibitionId,
                   storageKey = s"${exhibitionId.value}/${photoId.value}.jpg",
                   thumbKey = s"${exhibitionId.value}/${photoId.value}.thumb.jpg",
                   originalName = s"jeju-$index.jpg",
                   mime = "image/jpeg",
                   width = Some(320),
                   height = Some(240),
                   groupId = Some(groupId),
                   positionInGroup = Some(index),
                   caption = s"海边的第 ${index + 1} 张",
                   archivedAt = None,
                   createdAt = now
                 )
               }
      _ <- ExhibitionTable.insert(connection, exhibition)
      _ <- ExhibitionGroupTable.insert(connection, group)
      _ <- photos.traverse_(photo => ExhibitionPhotoTable.insert(connection, photo))
      _ <- photos.traverse_(photo => writePhotoFile(dataDirectory, photo.storageKey, jpeg))
    yield (userId, exhibitionId, photos)

  private def cleanup(connection: Connection, exhibitionId: ExhibitionId, photoIds: List[PhotoId]): IO[Unit] =
    val uuidArray = photoIds.map(_.value.toString).mkString("{", ",", "}")
    for
      _ <- Sql.update(
             connection,
             "DELETE FROM curation.chat_sessions WHERE exhibition_id = ?",
             List(SqlValue.Uuid(exhibitionId.value))
           )
      _ <- Sql.update(
             connection,
             "DELETE FROM curation.photo_analyses WHERE photo_id = ANY(?::uuid[])",
             List(SqlValue.Text(uuidArray))
           )
      _ <- Sql.update(
             connection,
             "DELETE FROM gallery.exhibitions WHERE id = ?",
             List(SqlValue.Uuid(exhibitionId.value))
           )
    yield ()

  private def loadConfig(dataDirectory: Path): IO[AppConfig] =
    DotEnv.load(Path.of(".env")).flatMap { dotEnv =>
      val environment = dotEnv ++ sys.env ++ Map(
        "DB_URL" -> aiDatabaseUrl,
        "DATA_DIR" -> dataDirectory.toString,
        "AI_MODE" -> "fake"
      )
      AppConfig.load(environment) match
        case Right(config) => IO.pure(config)
        case Left(error) => IO.raiseError(new IllegalStateException(s"测试配置无效：$error"))
    }

  private def temporaryDataDirectory: Resource[IO, Path] =
    Resource.make(IO.blocking(Files.createTempDirectory("momentarium-curation-api-")))(deleteDirectory)

  private def deleteDirectory(directory: Path): IO[Unit] =
    IO.blocking {
      import scala.jdk.CollectionConverters.*
      if Files.exists(directory) then
        val paths = Files.walk(directory).iterator().asScala.toList.sortBy(_.getNameCount).reverse
        paths.foreach(path => Files.deleteIfExists(path))
        ()
    }

  private def writePhotoFile(dataDirectory: Path, storageKey: String, bytes: Array[Byte]): IO[Unit] =
    IO.blocking {
      val target = dataDirectory.resolve(storageKey)
      Option(target.getParent).foreach(parent => Files.createDirectories(parent))
      Files.write(target, bytes)
      ()
    }

  private def sampleJpegBytes: IO[Array[Byte]] =
    IO.blocking {
      val image = new BufferedImage(320, 240, BufferedImage.TYPE_INT_RGB)
      val graphics = image.createGraphics()
      graphics.setColor(new Color(200, 130, 70))
      graphics.fillRect(0, 0, 320, 240)
      graphics.dispose()
      val output = new ByteArrayOutputStream()
      ImageIO.write(image, "jpeg", output)
      output.toByteArray
    }
