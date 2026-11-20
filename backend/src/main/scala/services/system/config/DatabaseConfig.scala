package services.system.config

/** PostgreSQL 连接参数（应用角色凭据只来自环境变量，不写入代码）。 */
final case class DatabaseConfig(url: String, user: String, password: String)

object DatabaseConfig:
  def fromEnvironment(environment: Map[String, String]): Either[String, DatabaseConfig] =
    for
      url <- EnvironmentVariables.required(environment, "DB_URL")
      user <- EnvironmentVariables.required(environment, "DB_USER")
      password <- EnvironmentVariables.required(environment, "DB_PASSWORD")
    yield DatabaseConfig(url, user, password)
