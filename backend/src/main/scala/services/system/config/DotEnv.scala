package services.system.config

import java.nio.file.{Files, Path}

import cats.effect.IO

/** 读取工作目录下的 .env：已有进程环境变量优先，.env.admin 永不加载。 */
object DotEnv:
  def load(path: Path): IO[Map[String, String]] =
    IO.blocking(Files.isRegularFile(path)).flatMap {
      case true => IO.blocking(Files.readString(path)).map(parse)
      case false => IO.pure(Map.empty)
    }

  def parse(content: String): Map[String, String] =
    content.linesIterator
      .map(_.trim)
      .filter(line => line.nonEmpty && !line.startsWith("#"))
      .flatMap(parseLine)
      .toMap

  private def parseLine(line: String): Option[(String, String)] =
    line.indexOf('=') match
      case -1 => None
      case index =>
        val key = line.substring(0, index).trim
        val rawValue = line.substring(index + 1).trim
        val value = rawValue.stripPrefix("\"").stripSuffix("\"").stripPrefix("'").stripSuffix("'")
        Option.when(key.nonEmpty)(key -> value)
