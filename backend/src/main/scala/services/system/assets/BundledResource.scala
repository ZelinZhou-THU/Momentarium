package services.system.assets

import scala.io.{Codec, Source}
import scala.util.Using

/** 随 jar 打包的文本资源（`src/main/resources`）读取；失败时带回原因，由调用方决定降级还是中止。 */
object BundledResource:

  def readText(path: String): Either[String, String] =
    Using(Source.fromResource(path)(using Codec.UTF8))(_.mkString).toEither.left
      .map(error => s"读取 $path 失败：${Option(error.getMessage).getOrElse(error.getClass.getSimpleName)}")
