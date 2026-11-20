package services.system.routes

final case class SampleMessage()

class RouteNameSpec extends munit.FunSuite:
  test("去掉 Message 后缀并转小写") {
    assertEquals(RouteName.fromMessageClassName("RegisterMessage"), "register")
    assertEquals(RouteName.fromMessageClassName("GetCurrentUserMessage"), "getcurrentuser")
    assertEquals(RouteName.fromMessageClassName("GetPublishedExhibitionMessage"), "getpublishedexhibition")
  }

  test("从消息类对象推导路由名") {
    assertEquals(RouteName.fromMessageClass(classOf[SampleMessage]), "sample")
  }
