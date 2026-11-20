package contract

import java.nio.file.{Files, Path}

import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import io.circe.parser.decode

import services.curation.routes.CurationRoutes
import services.gallery.routes.GalleryRoutes
import services.scene.routes.SceneRoutes
import services.users.routes.UsersRoutes
import services.system.routes.{ApiRoute, RouteRegistry}

class RouteInventorySpec extends munit.FunSuite:
  private case class Entry(service: String, routeName: String, requiresRequestBody: Boolean, apiClass: String)
  private given Decoder[Entry] = deriveDecoder[Entry]
  private val inventory = decode[List[Entry]](Files.readString(Path.of("..", "docs", "api-routes.json")))
    .fold(error => fail(error.getMessage), identity)
  private def entries(service: String, routes: List[ApiRoute]): List[Entry] =
    routes.map(route => Entry(service, route.routeName, route.requiresRequestBody, ""))
  private val actual = entries("users", UsersRoutes.apiMessages) ++ entries("gallery", GalleryRoutes.apiMessages) ++
    entries("curation", CurationRoutes.apiMessages) ++ entries("scene", SceneRoutes.apiMessages)

  private def check(routes: List[Entry]): Unit =
    assertEquals(routes.map(_.routeName).distinct.size, routes.size, "重复路由")
    assertEquals(routes.sortBy(_.routeName), inventory.map(_.copy(apiClass = "")).sortBy(_.routeName))

  test("共享清单与实际服务注册双向一致，含请求体要求") { check(actual) }
  test("顶层实际注册表没有遗漏或额外路由") {
    assertEquals(RouteRegistry.apiMessages.map(r => (r.routeName, r.requiresRequestBody)).sorted,
      actual.map(r => (r.routeName, r.requiresRequestBody)).sorted)
  }
  test("门禁能发现单侧新增、删除、同长度改名、请求体变化和重复") {
    val first = actual.head
    val mutations = List(
      actual :+ first.copy(routeName = "unregistered"), actual.tail,
      first.copy(routeName = "renamed") :: actual.tail,
      first.copy(requiresRequestBody = !first.requiresRequestBody) :: actual.tail,
      actual :+ first
    )
    mutations.foreach(routes => intercept[munit.ComparisonFailException](check(routes)))
  }
