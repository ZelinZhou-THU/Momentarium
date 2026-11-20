package services.system.geocode

import java.nio.file.Path
import java.util.UUID

import cats.effect.IO
import cats.effect.unsafe.implicits.global
import scala.concurrent.duration.*

import services.gallery.api.SearchPlacesMessage
import services.system.api.{ApiException, ErrorCode, UpstreamReason, ValidationReason}
import services.system.config.{AppConfig, DotEnv, GeocodingConfig, GeocodingMode}
import services.system.db.Database
import services.system.geocode.fake.FakeGeocoding
import services.system.geocode.objects.GeocodingUnavailable
import services.users.objects.UserId

/** 地点搜索代理（阶段 1）：fake 成功/空/不可用、查询校验、503 UPSTREAM_UNAVAILABLE(PLACE_SEARCH_UNAVAILABLE)。
  * 全部走 fake，不访问真实地理编码服务。
  */
class GeocodingSpec extends munit.FunSuite:
  private val fakeConfig = GeocodingConfig(
    mode = GeocodingMode.Fake,
    baseUrl = "http://localhost/not-used",
    userAgent = "momentarium-test",
    timeout = 1.second,
    minInterval = 1.millisecond,
    cacheSize = 8
  )

  test("FakeGeocoding：成功返回确定性候选、空结果标记返回空数组、不可用标记抛 GeocodingUnavailable") {
    val fake = FakeGeocoding()
    val places = fake.search("济州岛 涉地可支").unsafeRunSync()
    assertEquals(places.map(_.name), List("济州岛 涉地可支", "测试地点"))
    assert(places.forall(place => place.displayName.nonEmpty && place.latitude.isFinite && place.longitude.isFinite))
    assertEquals(fake.search("没有这个地点（无结果）").unsafeRunSync(), Nil)
    val failure = fake.search("服务不可用").attempt.unsafeRunSync()
    assert(failure.left.toOption.exists(_.isInstanceOf[GeocodingUnavailable]))
  }

  test("SearchPlacesMessage：成功、空结果、503 不可用、查询校验") {
    val databaseUrl = sys.env.getOrElse("DB_URL", fail("必须显式设置 DB_URL=jdbc:postgresql://localhost:5432/momentarium_test 运行本测试"))
    assert(databaseUrl.endsWith("_test"), s"本测试只允许连接 *_test 测试库，实际：$databaseUrl")
    (for
      dotEnv <- DotEnv.load(Path.of(".env"))
      config <- IO.fromEither(
                  AppConfig.load(dotEnv ++ sys.env).left.map(message => new IllegalStateException(message))
                )
      _ <- GeocodingRuntime.initialize(fakeConfig)
      _ <- Database.resource(config.database).use { database =>
             val userId = UserId(UUID.randomUUID())
             for
               success <- database.use(connection => SearchPlacesMessage(userId, "济州岛 涉地可支").plan(connection))
               _ <- IO(assertEquals(success.candidates.size, 2))
               _ <- IO(assertEquals(success.candidates.head.name, "济州岛 涉地可支"))
               empty <- database.use(connection => SearchPlacesMessage(userId, "无结果").plan(connection))
               _ <- IO(assertEquals(empty.candidates, Nil))
               unavailable <- database.use(connection => SearchPlacesMessage(userId, "不可用").plan(connection)).attempt
               _ <- IO(unavailable match
                        case Left(ApiException(error)) =>
                          assertEquals(error.code, ErrorCode.UpstreamUnavailable)
                          assertEquals(
                            error.details.flatMap(_.apply("reason")).flatMap(_.asString),
                            Some(UpstreamReason.toString(UpstreamReason.PlaceSearchUnavailable))
                          )
                        case other => fail(s"期望 503 UPSTREAM_UNAVAILABLE，实际: $other")
                      )
               blank <- database.use(connection => SearchPlacesMessage(userId, "   ").plan(connection)).attempt
               _ <- IO(blank match
                        case Left(ApiException(error)) =>
                          assertEquals(error.code, ErrorCode.Validation)
                          assertEquals(
                            error.details.flatMap(_.apply("reason")).flatMap(_.asString),
                            Some(ValidationReason.toString(ValidationReason.PlaceQueryInvalid))
                          )
                        case other => fail(s"期望 VALIDATION(PLACE_QUERY_INVALID)，实际: $other")
                      )
               tooLong <- database.use(connection => SearchPlacesMessage(userId, "地" * 201).plan(connection)).attempt
               _ <- IO(assert(tooLong.isLeft, "超长 query 应失败"))
             yield ()
           }
    yield ()).unsafeRunSync()
  }
