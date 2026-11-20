package services.system.config

import java.nio.file.Path

/** 进程运行所需的全部配置，启动时从环境变量（含 .env 合并结果）一次读取。 */
final case class AppConfig(
  port: Int,
  dataDir: Path,
  database: DatabaseConfig,
  ai: AiConfig,
  scene: SceneConfig,
  geocoding: GeocodingConfig,
  contributions: ContributionConfig
)

object AppConfig:
  def load(environment: Map[String, String]): Either[String, AppConfig] =
    for
      port <- EnvironmentVariables.int(environment, "PORT", 8080)
      dataDir <- EnvironmentVariables.path(environment, "DATA_DIR", "data")
      database <- DatabaseConfig.fromEnvironment(environment)
      ai <- AiConfig.fromEnvironment(environment)
      scene <- SceneConfig.fromEnvironment(environment)
      geocoding <- GeocodingConfig.fromEnvironment(environment)
      contributions <- ContributionConfig.fromEnvironment(environment)
    yield AppConfig(port, dataDir, database, ai, scene, geocoding, contributions)
