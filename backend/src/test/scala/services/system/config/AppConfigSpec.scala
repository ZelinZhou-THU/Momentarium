package services.system.config

class AppConfigSpec extends munit.FunSuite:
  private val databaseEnvironment = Map(
    "DB_URL" -> "jdbc:postgresql://localhost:5432/momentarium",
    "DB_USER" -> "momentarium",
    "DB_PASSWORD" -> "test-password"
  )

  test("缺失数据库配置时报出明确错误") {
    val result = AppConfig.load(Map.empty)
    assert(result.isLeft)
    assertEquals(result.swap.toOption.map(_.contains("DB_URL")), Some(true))
  }

  test("默认值：端口 8080、AI_MODE=fake、协议 openai、场景参数") {
    val config = AppConfig.load(databaseEnvironment).toOption.get
    assertEquals(config.port, 8080)
    assertEquals(AiMode.toString(config.ai.mode), "fake")
    assertEquals(AiProtocol.toString(config.ai.textProtocol), "openai")
    assertEquals(AiProtocol.toString(config.ai.visionProtocol), "openai")
    assertEquals(config.ai.watchdog.toMillis, 1800000L)
    assertEquals(config.ai.streamIdle.toMillis, 300000L)
    assertEquals(config.scene.reviewPassScore, 3.0)
    assertEquals(config.scene.maxRevisions, 2)
    assertEquals(config.scene.codeLimitKb, 1024)
    assertEquals(config.ai.apiKey, None)
  }

  test("非法 AI_MODE 启动失败而不是静默兜底") {
    val result = AppConfig.load(databaseEnvironment + ("AI_MODE" -> "unknown"))
    assert(result.isLeft)
  }

  test("AI_REASONING_EFFORT：默认 max，合法值解析，off 不发送，非法值启动失败") {
    assertEquals(AppConfig.load(databaseEnvironment).toOption.flatMap(_.ai.reasoningEffort), Some(ReasoningEffort.Max))
    val low = AppConfig.load(databaseEnvironment + ("AI_REASONING_EFFORT" -> " Low "))
    assertEquals(low.toOption.flatMap(_.ai.reasoningEffort), Some(ReasoningEffort.Low))
    val off = AppConfig.load(databaseEnvironment + ("AI_REASONING_EFFORT" -> "off"))
    assertEquals(off.toOption.map(_.ai.reasoningEffort), Some(None))
    assert(AppConfig.load(databaseEnvironment + ("AI_REASONING_EFFORT" -> "turbo")).isLeft)
  }

  test("AI_STREAM_IDLE_MS：可覆盖流式空闲上限，非法值启动失败") {
    assertEquals(AppConfig.load(databaseEnvironment + ("AI_STREAM_IDLE_MS" -> "90000")).toOption.map(_.ai.streamIdle.toMillis), Some(90000L))
    assert(AppConfig.load(databaseEnvironment + ("AI_STREAM_IDLE_MS" -> "soon")).isLeft)
  }

  test("非法协议启动失败") {
    val result = AppConfig.load(databaseEnvironment + ("AI_TEXT_PROTOCOL" -> "anthropic"))
    assert(result.isLeft)
  }

  test("地理编码默认 fake 且不触网；可显式切换 live 与调整限流/缓存参数") {
    val defaults = AppConfig.load(databaseEnvironment).toOption.get.geocoding
    assertEquals(GeocodingMode.toString(defaults.mode), "fake")
    assertEquals(defaults.timeout.toMillis, 5000L)
    assertEquals(defaults.minInterval.toMillis, 1000L)
    assertEquals(defaults.cacheSize, 128)

    val live = AppConfig
      .load(
        databaseEnvironment ++ Map(
          "GEOCODE_MODE" -> "live",
          "GEOCODE_TIMEOUT_MS" -> "2000",
          "GEOCODE_MIN_INTERVAL_MS" -> "500",
          "GEOCODE_CACHE_SIZE" -> "16"
        )
      )
      .toOption
      .get
      .geocoding
    assertEquals(GeocodingMode.toString(live.mode), "live")
    assertEquals(live.timeout.toMillis, 2000L)
    assertEquals(live.minInterval.toMillis, 500L)
    assertEquals(live.cacheSize, 16)
    assert(AppConfig.load(databaseEnvironment + ("GEOCODE_MODE" -> "unknown")).isLeft)
    assert(AppConfig.load(databaseEnvironment + ("GEOCODE_TIMEOUT_MS" -> "0")).isLeft)
  }

  test("共同投稿配额：默认计划值，可经 6 个 CONTRIBUTION_* 环境变量覆盖，非法值启动失败") {
    val defaults = AppConfig.load(databaseEnvironment).toOption.get.contributions
    assertEquals(defaults.maxFileBytes, 15L * 1024 * 1024)
    assertEquals(defaults.maxBatchFiles, 10)
    assertEquals(defaults.maxPhotosPerUser, 20)
    assertEquals(defaults.maxBytesPerUser, 256L * 1024 * 1024)
    assertEquals(defaults.maxPhotosPerExhibition, 60)
    assertEquals(defaults.maxBytesPerExhibition, 768L * 1024 * 1024)

    val overridden = AppConfig
      .load(
        databaseEnvironment ++ Map(
          "CONTRIBUTION_MAX_FILE_MB" -> "2",
          "CONTRIBUTION_MAX_BATCH" -> "3",
          "CONTRIBUTION_MAX_PHOTOS_PER_USER" -> "5",
          "CONTRIBUTION_MAX_BYTES_PER_USER" -> "1024",
          "CONTRIBUTION_MAX_PHOTOS_PER_EXHIBITION" -> "7",
          "CONTRIBUTION_MAX_BYTES_PER_EXHIBITION" -> "2048"
        )
      )
      .toOption
      .get
      .contributions
    assertEquals(overridden.maxFileBytes, 2L * 1024 * 1024)
    assertEquals(overridden.maxBatchFiles, 3)
    assertEquals(overridden.maxPhotosPerUser, 5)
    assertEquals(overridden.maxBytesPerUser, 1024L)
    assertEquals(overridden.maxPhotosPerExhibition, 7)
    assertEquals(overridden.maxBytesPerExhibition, 2048L)

    assert(AppConfig.load(databaseEnvironment + ("CONTRIBUTION_MAX_BATCH" -> "0")).isLeft)
    assert(AppConfig.load(databaseEnvironment + ("CONTRIBUTION_MAX_FILE_MB" -> "-1")).isLeft)
    assert(AppConfig.load(databaseEnvironment + ("CONTRIBUTION_MAX_BATCH" -> "many")).isLeft)
  }

  test("显式配置覆盖默认值") {
    val environment = databaseEnvironment ++ Map(
      "PORT" -> "9090",
      "DATA_DIR" -> "data/test",
      "AI_API_KEY" -> "test-key",
      "AI_WATCHDOG_MS" -> "1000",
      "REVIEW_PASS_SCORE" -> "4.0",
      "SCENE_MAX_REVISIONS" -> "3",
      "SCENE_CODE_LIMIT_KB" -> "10"
    )
    val config = AppConfig.load(environment).toOption.get
    assertEquals(config.port, 9090)
    assertEquals(config.dataDir.toString, "data\\test")
    assertEquals(config.ai.apiKey, Some("test-key"))
    assertEquals(config.ai.watchdog.toMillis, 1000L)
    assertEquals(config.scene.reviewPassScore, 4.0)
    assertEquals(config.scene.maxRevisions, 3)
    assertEquals(config.scene.codeLimitKb, 10)
  }
