package services.gallery.api

import java.util.UUID

import cats.effect.IO
import cats.effect.unsafe.implicits.global
import cats.syntax.all.*

import services.FourPagesFixtures
import services.FourPagesFixtures.t0
import services.gallery.objects.*
import services.gallery.objects.apiTypes.{AuthorJourneyLocation, PublicAuthorView}
import services.gallery.tables.*
import services.scene.tables.SceneRunTable
import services.system.api.{ApiException, ErrorCode}
import services.system.db.{Database, Sql, SqlValue}
import services.users.api.{RegisterMessage, UpdateMyProfileMessage}
import services.users.objects.UserId
import services.users.tables.SessionTable

class AuthorPageSpec extends munit.FunSuite:
  test("作者主页：未开启 404；开启后只列出已发布展览；公开页附带作者入口；不存在的用户同样 404") {
    FourPagesFixtures.withDatabase(scenario).unsafeRunSync()
  }

  test("作者主页足迹：只聚合 active 快照公开位置，展览按发布倒序、同展览按快照照片顺序，旧快照不贡献") {
    FourPagesFixtures.withDatabase(journeyScenario).unsafeRunSync()
  }

  private def scenario(database: Database): IO[Unit] =
    val username = s"author_${UUID.randomUUID().toString.replace("-", "").take(12)}"
    val published = ExhibitionId(UUID.randomUUID())
    val draftOnly = ExhibitionId(UUID.randomUUID())
    for
      // 注册成功后才持有 ownerId；之后无论断言是否失败都在 guarantee 中清理本测试创建的行，
      // 避免测试库残留展览/照片/场景/账户/会话（task-10 测试卫生，仅删本测试随机 ID 的行）。
      createdOwner <- IO.ref(Option.empty[UserId])
      _ <- (for
             registered <- database.use(connection => RegisterMessage(username, "ExamplePassw0rd").plan(connection))
             owner = registered.user.id
             _ <- createdOwner.set(Some(owner))
             _ <- List(published -> "雾港", draftOnly -> "未发布").traverse_ { case (id, title) => seedExhibition(database, owner, id, title) }
             _ <- database.use(connection => PublishExhibitionMessage(owner, published).plan(connection)).void

             _ <- expectNotFound(database.use(connection => GetAuthorPageMessage(username).plan(connection)))
             hidden <- database.use(connection => GetPublishedExhibitionMessage(published).plan(connection))
             _ <- IO(assertEquals(hidden.author, None))

             _ <- database.use(connection => UpdateMyProfileMessage(owner, "雾港旅人", "喜欢海边", true).plan(connection)).void
             page <- database.use(connection => GetAuthorPageMessage(username).plan(connection))
             _ <- IO(assertEquals((page.displayName, page.bio), ("雾港旅人", "喜欢海边")))
             _ <- IO(assertEquals(page.exhibitions.map(_.id), List(published)))
             _ <- IO(assertEquals(page.journeyLocations, Nil, "没有公开位置的作者足迹为空数组"))
             _ <- IO(assertEquals(page.exhibitions.head.cover.imageUrl, s"/api/exhibitions/${published.value}/cover"))
             shown <- database.use(connection => GetPublishedExhibitionMessage(published).plan(connection))
             _ <- IO(assertEquals(shown.author, Some(PublicAuthorView(username, "雾港旅人"))))

             _ <- expectNotFound(database.use(connection => GetAuthorPageMessage(s"${username}_missing").plan(connection)))
           yield ()).guarantee(
             createdOwner.get.flatMap(_.fold(IO.unit)(owner => cleanup(database, owner, List(published, draftOnly))))
           )
    yield ()

  private def journeyScenario(database: Database): IO[Unit] =
    val username = s"journey_${UUID.randomUUID().toString.replace("-", "").take(12)}"
    val earlyId = ExhibitionId(UUID.randomUUID())
    val lateId = ExhibitionId(UUID.randomUUID())
    val legacyId = ExhibitionId(UUID.randomUUID())
    val draftId = ExhibitionId(UUID.randomUUID())
    for
      createdOwner <- IO.ref(Option.empty[UserId])
      _ <- (for
             registered <- database.use(connection => RegisterMessage(username, "ExamplePassw0rd").plan(connection))
             owner = registered.user.id
             _ <- createdOwner.set(Some(owner))
             earlyPhotos <- seedExhibition(database, owner, earlyId, "雾港早展", photoCount = 4)
             latePhotos <- seedExhibition(database, owner, lateId, "雾港晚展")
             draftPhotos <- seedExhibition(database, owner, draftId, "未发布草稿")
             _ <- seedExhibition(database, owner, legacyId, "旧版快照")
             // 早展：area 与 exact 进快照，hidden 与 suggested 不公开；位置行顺序故意与照片顺序不同。
             _ <- seedLocations(
                    database,
                    List(
                      confirmed(earlyPhotos(2).id, "雷峰塔", 30.23, 120.14, LocationGranularity.Exact),
                      confirmed(earlyPhotos(1).id, "不公开的私藏", 30.26, 120.16, LocationGranularity.Hidden),
                      confirmed(earlyPhotos(0).id, "西湖", 30.25, 120.15, LocationGranularity.Area),
                      suggested(earlyPhotos(3).id, "断桥", 30.26, 120.15)
                    )
                  )
             _ <- seedLocations(
                    database,
                    List(
                      confirmed(latePhotos(2).id, "外滩", 31.24, 121.49, LocationGranularity.Exact),
                      confirmed(latePhotos(0).id, "豫园", 31.23, 121.49, LocationGranularity.Area)
                    )
                  )
             _ <- seedLocations(database, List(confirmed(draftPhotos.head.id, "草稿位置", 30.0, 120.0, LocationGranularity.Area)))
             _ <- publish(database, owner, earlyId)
             _ <- publish(database, owner, lateId)
             _ <- publish(database, owner, legacyId)
             // 旧快照：删除 locations 键（v1.7 之前的快照形态），该展览的卡片仍在但不再贡献足迹。
             _ <- database.use(connection =>
                    Sql.update(
                      connection,
                      """UPDATE gallery.publications
                        |SET snapshot_json = snapshot_json - 'locations'
                        |WHERE exhibition_id = ? AND status = 'active'""".stripMargin,
                      List(SqlValue.Uuid(legacyId.value))
                    )
                  )
             // 发布后改动实时位置表：足迹必须继续使用快照冻结值，而不是 photo_locations 实时行。
             _ <- seedLocations(database, List(confirmed(earlyPhotos(0).id, "发布后改名", 31.0, 121.0, LocationGranularity.Exact)))
             _ <- database.use(connection => PhotoLocationTable.deleteByPhotoId(connection, earlyPhotos(2).id))
             _ <- database.use(connection => UpdateMyProfileMessage(owner, "足迹作者", "跨展览足迹", true).plan(connection)).void

             page <- database.use(connection => GetAuthorPageMessage(username).plan(connection))
             _ <- IO(assertEquals(page.exhibitions.map(_.id), List(legacyId, lateId, earlyId), "展览卡片仍按发布倒序"))
             _ <- IO(
                    assertEquals(
                      page.journeyLocations,
                      List(
                        AuthorJourneyLocation(lateId, "雾港晚展", latePhotos(0).id, "豫园", 31.23, 121.49, LocationGranularity.Area),
                        AuthorJourneyLocation(lateId, "雾港晚展", latePhotos(2).id, "外滩", 31.24, 121.49, LocationGranularity.Exact),
                        AuthorJourneyLocation(earlyId, "雾港早展", earlyPhotos(0).id, "西湖", 30.25, 120.15, LocationGranularity.Area),
                        AuthorJourneyLocation(earlyId, "雾港早展", earlyPhotos(2).id, "雷峰塔", 30.23, 120.14, LocationGranularity.Exact)
                      )
                    )
                  )
             _ <- IO(assertEquals(page.journeyLocations.filter(_.exhibitionId == legacyId), Nil, "旧快照无 locations 不贡献"))
             _ <- IO(assertEquals(page.journeyLocations.filter(_.exhibitionId == draftId), Nil, "不读草稿位置"))
             _ <- IO(
                    assert(
                      page.journeyLocations.forall(location =>
                        location.granularity == LocationGranularity.Area || location.granularity == LocationGranularity.Exact
                      ),
                      "足迹只含 area/exact"
                    )
                  )
           yield ()).guarantee(
             createdOwner.get.flatMap(_.fold(IO.unit)(owner => cleanup(database, owner, List(earlyId, lateId, legacyId, draftId))))
           )
    yield ()

  private def seedExhibition(
    database: Database,
    owner: UserId,
    id: ExhibitionId,
    title: String,
    photoCount: Int = 3
  ): IO[List[ExhibitionPhoto]] =
    val groupId = GroupId(UUID.randomUUID())
    val photos = (1 to photoCount).toList.map(index => FourPagesFixtures.photo(id, groupId, index))
    val run = FourPagesFixtures.succeededRun(owner, id, photos.map(_.id), t0, "海", "1")
    database.use { connection =>
      for
        _ <- ExhibitionTable.insert(connection, FourPagesFixtures.exhibition(id, owner, title))
        _ <- ExhibitionGroupTable.insert(connection, ExhibitionGroup(groupId, id, "章一", "", 0))
        _ <- photos.traverse_(photo => ExhibitionPhotoTable.insert(connection, photo))
        _ <- SceneRunTable.insert(connection, run)
        _ <- ExhibitionTable.setCurrentSceneRun(connection, id, run.id, t0)
      yield photos
    }

  private def publish(database: Database, owner: UserId, exhibitionId: ExhibitionId): IO[Unit] =
    database.use(connection => PublishExhibitionMessage(owner, exhibitionId).plan(connection)).void

  private def seedLocations(database: Database, locations: List[PhotoLocation]): IO[Unit] =
    database.use(connection => locations.traverse_(location => PhotoLocationTable.upsert(connection, location)))

  private def confirmed(
    photoId: PhotoId,
    name: String,
    latitude: Double,
    longitude: Double,
    granularity: LocationGranularity
  ): PhotoLocation =
    PhotoLocation(
      photoId = photoId,
      source = LocationSource.Manual,
      status = LocationStatus.Confirmed,
      name = name,
      latitude = Some(latitude),
      longitude = Some(longitude),
      granularity = granularity,
      updatedAt = t0
    )

  private def suggested(photoId: PhotoId, name: String, latitude: Double, longitude: Double): PhotoLocation =
    PhotoLocation(
      photoId = photoId,
      source = LocationSource.Exif,
      status = LocationStatus.Suggested,
      name = name,
      latitude = Some(latitude),
      longitude = Some(longitude),
      granularity = LocationGranularity.Area,
      updatedAt = t0
    )

  /** 只删除本测试随机创建的展览（级联照片/章节/发布/位置）、场景运行、账户（级联 profile）与会话。
    * 清理失败不遮盖原测试失败；不做范围外的历史数据删除。 */
  private def cleanup(database: Database, owner: UserId, exhibitionIds: List[ExhibitionId]): IO[Unit] =
    database
      .use { connection =>
        for
          _ <- SessionTable.deleteByUserId(connection, owner)
          _ <- exhibitionIds.traverse_(id =>
                 Sql.update(
                   connection,
                   "DELETE FROM scene.scene_runs WHERE exhibition_id = ?",
                   List(SqlValue.Uuid(id.value))
                 )
               )
          _ <- exhibitionIds.traverse_(id => ExhibitionTable.delete(connection, id, owner))
          _ <- Sql.update(connection, "DELETE FROM users.users WHERE id = ?", List(SqlValue.Uuid(owner.value)))
        yield ()
      }
      .attempt
      .void

  private def expectNotFound(action: IO[?]): IO[Unit] =
    action.attempt.map {
      case Left(ApiException(error)) => assertEquals(error.code, ErrorCode.NotFound)
      case other => fail(s"期望 NOT_FOUND，实际 $other")
    }
