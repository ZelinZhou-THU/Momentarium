package services.curation

import java.util.UUID

import cats.effect.IO
import cats.effect.unsafe.implicits.global
import cats.syntax.all.*

import services.FourPagesFixtures
import services.FourPagesFixtures.t0
import services.curation.api.GetPhotoInsightsMessage
import services.curation.objects.{PhotoAnalysis, PhotoAnalysisRecord}
import services.curation.tables.PhotoAnalysisTable
import services.gallery.objects.*
import services.gallery.tables.*
import services.scene.tables.SceneRunTable
import services.system.api.{ApiException, ErrorCode}
import services.system.db.{Database, Sql, SqlValue}
import services.users.objects.UserId

class PhotoInsightsApiSpec extends munit.FunSuite:
  test("照片解读：只返回草稿中已分析的照片；归档照片不返回；带最近成功题面；非作者 404") {
    FourPagesFixtures.withDatabase(scenario).unsafeRunSync()
  }

  private def scenario(database: Database): IO[Unit] =
    val owner = UserId(UUID.randomUUID())
    val stranger = UserId(UUID.randomUUID())
    val exhibitionId = ExhibitionId(UUID.randomUUID())
    val groupId = GroupId(UUID.randomUUID())
    val analyzed = FourPagesFixtures.photo(exhibitionId, groupId, 1)
    val notAnalyzed = FourPagesFixtures.photo(exhibitionId, groupId, 2)
    val archived = FourPagesFixtures.photo(exhibitionId, groupId, 3, archived = true)
    val run = FourPagesFixtures.succeededRun(owner, exhibitionId, Nil, t0, "潮湿的思念", "1")
    val body = for
      emptyBefore <- database.use { connection =>
                       for
                         _ <- ExhibitionTable.insert(connection, FourPagesFixtures.exhibition(exhibitionId, owner, "雨街"))
                         _ <- ExhibitionGroupTable.insert(connection, ExhibitionGroup(groupId, exhibitionId, "章一", "", 0))
                         _ <- List(analyzed, notAnalyzed, archived).traverse_(photo => ExhibitionPhotoTable.insert(connection, photo))
                         response <- GetPhotoInsightsMessage(owner, exhibitionId).plan(connection)
                       yield response
                     }
      _ <- IO(assertEquals((emptyBefore.analyses, emptyBefore.latestBrief), (Nil, None)))
      _ <- database.use { connection =>
             for
               _ <- PhotoAnalysisTable.upsert(connection, recordOf(analyzed.id))
               _ <- PhotoAnalysisTable.upsert(connection, recordOf(archived.id))
               _ <- SceneRunTable.insert(connection, run)
               _ <- ExhibitionTable.setCurrentSceneRun(connection, exhibitionId, run.id, t0)
             yield ()
           }
      response <- database.use(connection => GetPhotoInsightsMessage(owner, exhibitionId).plan(connection))
      _ <- IO(assertEquals(response.analyses.map(_.photoId), List(analyzed.id)))
      _ <- IO(assertEquals(response.analyses.head.analysis.mood, "安静"))
      _ <- IO(assertEquals(response.latestBrief, run.brief))
      _ <- database
             .use(connection => GetPhotoInsightsMessage(stranger, exhibitionId).plan(connection))
             .attempt
             .map {
               case Left(ApiException(error)) => assertEquals(error.code, ErrorCode.NotFound)
               case other => fail(s"期望 NOT_FOUND，实际 $other")
             }
    yield ()
    // 测试结束（含断言失败）都清理本测试随机创建的行，避免测试库残留（task-11 测试卫生）。
    body.guarantee(cleanup(database, owner, exhibitionId, List(analyzed.id, archived.id)))

  /** 只删除本测试随机 ID 创建的分析缓存、场景运行与展览（级联照片/章节/发布）；不清理历史残留。 */
  private def cleanup(
    database: Database,
    owner: UserId,
    exhibitionId: ExhibitionId,
    analyzedPhotoIds: List[PhotoId]
  ): IO[Unit] =
    database
      .use { connection =>
        for
          _ <- analyzedPhotoIds.traverse_(photoId =>
                 Sql.update(
                   connection,
                   "DELETE FROM curation.photo_analyses WHERE photo_id = ?",
                   List(SqlValue.Uuid(photoId.value))
                 )
               )
          _ <- Sql.update(
                 connection,
                 "DELETE FROM scene.scene_runs WHERE exhibition_id = ?",
                 List(SqlValue.Uuid(exhibitionId.value))
               )
          _ <- ExhibitionTable.delete(connection, exhibitionId, owner)
        yield ()
      }
      .attempt
      .void

  private def recordOf(photoId: PhotoId): PhotoAnalysisRecord =
    PhotoAnalysisRecord(
      photoId = photoId,
      analysis = PhotoAnalysis("窗边的雨", "安静", List("#334455"), List("雨声"), "潮湿", "雨落下的时候"),
      model = "deepseek-v4.1-flash",
      analyzedAt = t0
    )
