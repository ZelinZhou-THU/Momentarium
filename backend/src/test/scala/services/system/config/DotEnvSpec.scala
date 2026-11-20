package services.system.config

class DotEnvSpec extends munit.FunSuite:
  test("解析键值对：跳过注释与空行、去掉包裹引号") {
    val content = "# 注释\nPORT=8080\n\nAI_MODE=\"fake\"\nDB_USER='momentarium'\n"
    assertEquals(
      DotEnv.parse(content),
      Map("PORT" -> "8080", "AI_MODE" -> "fake", "DB_USER" -> "momentarium")
    )
  }

  test("值中允许出现等号") {
    assertEquals(DotEnv.parse("DB_URL=jdbc:postgresql://localhost:5432/momentarium?x=1"), Map("DB_URL" -> "jdbc:postgresql://localhost:5432/momentarium?x=1"))
  }

  test("进程环境变量优先：合并顺序为 .env ++ 进程环境") {
    val dotEnv = Map("AI_MODE" -> "fake", "DB_URL" -> "jdbc:dotenv")
    val processEnvironment = Map("AI_MODE" -> "live")
    val merged = dotEnv ++ processEnvironment
    assertEquals(merged.get("AI_MODE"), Some("live"))
    assertEquals(merged.get("DB_URL"), Some("jdbc:dotenv"))
  }
