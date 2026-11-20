package services.system.routes

class RouteRegistrySpec extends munit.FunSuite:
  test("顶层注册表包含 users 的 4 条路由，路由名由消息类名推导") {
    val routeNames = RouteRegistry.apiMessages.map(_.routeName)
    assert(routeNames.contains("register"))
    assert(routeNames.contains("login"))
    assert(routeNames.contains("getcurrentuser"))
    assert(routeNames.contains("logout"))
  }

  test("四个新页面的 8 条路由已注册，请求体要求与消息类别一致") {
    val routesByName = RouteRegistry.apiMessages.map(route => route.routeName -> route).toMap
    val expected = Map(
      "listsceneruns" -> true,
      "getscenerunbyid" -> true,
      "restorescenerun" -> true,
      "getphotoinsights" -> true,
      "getmyprofile" -> false,
      "updatemyprofile" -> true,
      "changepassword" -> true,
      "getauthorpage" -> true
    )
    expected.foreach { case (name, bodyRequired) =>
      assertEquals(routesByName.get(name).map(_.requiresRequestBody), Some(bodyRequired), name)
    }
    // 阶段 1 位置/搜索 3 条 + 阶段 2 共同投稿 11 条 + 阶段 2.5 回忆优先 2 条 +
    // 阶段 3 地点候选 3 条 + 阶段 4 场景修订 2 条：30 → 33 → 44 → 46 → 49 → 51。
    assertEquals(RouteRegistry.apiMessages.size, 52)
  }

  test("阶段 4 场景修订 2 条路由已注册，请求体上限与契约一致") {
    val routesByName = RouteRegistry.apiMessages.map(route => route.routeName -> route).toMap
    List("revisescene", "acceptscenerun", "dismissscenerun").foreach { name =>
      assertEquals(routesByName.get(name).map(_.requiresRequestBody), Some(true), name)
    }
    assertEquals(
      routesByName("revisescene").maxRequestBodyBytes,
      Some(JsonRequestBody.RevisionMaxBytes),
      "revisescene 请求体上限 2 MiB"
    )
    assertEquals(
      routesByName("reviewscene").maxRequestBodyBytes,
      Some(JsonRequestBody.ReviewMaxBytes),
      "reviewscene 请求体上限 12 MiB"
    )
    assertEquals(routesByName("generatescene").maxRequestBodyBytes, None)
  }

  test("阶段 1 位置与地点搜索 3 条路由已注册且需要请求体") {
    val routesByName = RouteRegistry.apiMessages.map(route => route.routeName -> route).toMap
    List("setphotolocation", "clearphotolocation", "searchplaces").foreach { name =>
      assertEquals(routesByName.get(name).map(_.requiresRequestBody), Some(true), name)
    }
  }

  test("阶段 2 共同投稿 11 条消息路由已注册且需要请求体") {
    val routesByName = RouteRegistry.apiMessages.map(route => route.routeName -> route).toMap
    List(
      "createcontributioninvite",
      "getcontributionmanagement",
      "closecontributioninvite",
      "getcontributioninvite",
      "joincontribution",
      "revokecontributor",
      "listcontributions",
      "updatecontribution",
      "withdrawcontribution",
      "adoptcontribution",
      "removememory"
    ).foreach { name =>
      assertEquals(routesByName.get(name).map(_.requiresRequestBody), Some(true), name)
    }
  }

  test("阶段 2.5 回忆优先 2 条消息路由已注册且需要请求体") {
    val routesByName = RouteRegistry.apiMessages.map(route => route.routeName -> route).toMap
    List("createcontribution", "declinecontribution").foreach { name =>
      assertEquals(routesByName.get(name).map(_.requiresRequestBody), Some(true), name)
    }
  }

  test("阶段 3 AI 地点候选 3 条消息路由已注册且需要请求体") {
    val routesByName = RouteRegistry.apiMessages.map(route => route.routeName -> route).toMap
    List("suggestphotolocation", "getphotolocationcandidates", "confirmphotolocationcandidate").foreach { name =>
      assertEquals(routesByName.get(name).map(_.requiresRequestBody), Some(true), name)
    }
  }

  test("注册表内路由名唯一（防止不同消息类推导出同一路由）") {
    val routeNames = RouteRegistry.apiMessages.map(_.routeName)
    assertEquals(routeNames.distinct.length, routeNames.length)
  }

  test("请求体要求与消息类别一致") {
    val routesByName = RouteRegistry.apiMessages.map(route => route.routeName -> route).toMap
    assertEquals(routesByName("register").requiresRequestBody, true)
    assertEquals(routesByName("login").requiresRequestBody, true)
    assertEquals(routesByName("getcurrentuser").requiresRequestBody, false)
    assertEquals(routesByName("logout").requiresRequestBody, false)
  }
