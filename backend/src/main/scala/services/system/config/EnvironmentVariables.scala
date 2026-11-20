package services.system.config

/** 环境变量读取工具：缺失时给出默认值或明确的配置错误。 */
object EnvironmentVariables:
  def required(environment: Map[String, String], key: String): Either[String, String] =
    environment.get(key).map(_.trim).filter(_.nonEmpty).toRight(s"缺少必需的环境变量: $key")

  def string(environment: Map[String, String], key: String, default: String): Either[String, String] =
    Right(environment.get(key).map(_.trim).filter(_.nonEmpty).getOrElse(default))

  def optional(environment: Map[String, String], key: String): Option[String] =
    environment.get(key).map(_.trim).filter(_.nonEmpty)

  def int(environment: Map[String, String], key: String, default: Int): Either[String, Int] =
    string(environment, key, default.toString).flatMap { raw =>
      raw.toIntOption.toRight(s"环境变量 $key 必须是整数，实际值无法解析")
    }

  def long(environment: Map[String, String], key: String, default: Long): Either[String, Long] =
    string(environment, key, default.toString).flatMap { raw =>
      raw.toLongOption.toRight(s"环境变量 $key 必须是整数，实际值无法解析")
    }

  def double(environment: Map[String, String], key: String, default: Double): Either[String, Double] =
    string(environment, key, default.toString).flatMap { raw =>
      raw.toDoubleOption.toRight(s"环境变量 $key 必须是数字，实际值无法解析")
    }

  def path(environment: Map[String, String], key: String, default: String): Either[String, java.nio.file.Path] =
    string(environment, key, default).map(java.nio.file.Path.of(_))
