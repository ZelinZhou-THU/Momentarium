package services.gallery.utils

import java.nio.file.{Files, Path}

import cats.effect.{IO, Resource}
import cats.syntax.all.*
import fs2.Stream

import services.gallery.objects.{ExhibitionId, PhotoFormat, PhotoId}

/** 照片文件存储：key 全部由服务端生成，原图、缩略图与去元数据展示副本落在 DATA_DIR 下，相对路径解析限制在根目录内。 */
private[gallery] object PhotoStorage:
  def originalKey(exhibitionId: ExhibitionId, photoId: PhotoId, format: PhotoFormat): String =
    s"${exhibitionId.value}/${photoId.value}.${format.fileExtension}"

  def thumbnailKey(exhibitionId: ExhibitionId, photoId: PhotoId): String =
    s"${exhibitionId.value}/${photoId.value}.thumb.jpg"

  /** 公开展示副本的确定性 key（无需新增列）：方向纠正、重编码后的无元数据 JPEG；原图保持私有。 */
  def displayKey(exhibitionId: ExhibitionId, photoId: PhotoId): String =
    s"${exhibitionId.value}/${photoId.value}.display.jpg"

  def write(root: Path, relativeKey: String, bytes: Array[Byte]): IO[Unit] =
    for
      target <- resolveWithin(root, relativeKey)
      _ <- Option(target.getParent).fold(IO.unit)(parent => IO.blocking(Files.createDirectories(parent)))
      _ <- IO.blocking(Files.write(target, bytes))
    yield ()

  def read(root: Path, relativeKey: String): IO[Array[Byte]] =
    resolveWithin(root, relativeKey).flatMap(target => IO.blocking(Files.readAllBytes(target)))

  /** 读取可能缺失的文件：不存在返回 None，用于把「展示副本缺失」显式转成不可用错误而不是回退原图。 */
  def readOption(root: Path, relativeKey: String): IO[Option[Array[Byte]]] =
    resolveWithin(root, relativeKey).flatMap(target =>
      IO.blocking(Option.when(Files.isRegularFile(target))(Files.readAllBytes(target)))
    )

  def exists(root: Path, relativeKey: String): IO[Boolean] =
    resolveWithin(root, relativeKey).flatMap(target => IO.blocking(Files.isRegularFile(target)))

  def delete(root: Path, relativeKeys: List[String]): IO[Unit] =
    relativeKeys.traverse_ { relativeKey =>
      resolveWithin(root, relativeKey).flatMap(target => IO.blocking(Files.deleteIfExists(target)).void)
    }

  /** multipart 上传期间的系统临时目录：请求结束后整体删除。 */
  def temporaryDirectory: Resource[IO, Path] =
    Resource.make(IO.blocking(Files.createTempDirectory("momentarium-photo-upload-")))(directory =>
      deleteDirectory(directory)
    )

  /** 把请求体字节流边读边写到临时文件，内存中只保留单个 chunk。 */
  def writeTemporaryFile(directory: Path, body: Stream[IO, Byte]): IO[Path] =
    for
      fileName <- IO.randomUUID.map(uuid => s"$uuid.upload")
      path = directory.resolve(fileName)
      _ <- Resource
             .fromAutoCloseable(IO.blocking(Files.newOutputStream(path)))
             .use(output => body.chunks.evalMap(chunk => IO.blocking(output.write(chunk.toArray))).compile.drain)
    yield path

  def fileSize(path: Path): IO[Long] =
    IO.blocking(Files.size(path))

  def readPrefix(path: Path, byteCount: Int): IO[Array[Byte]] =
    Resource
      .fromAutoCloseable(IO.blocking(Files.newInputStream(path)))
      .use(input => IO.blocking(input.readNBytes(byteCount)))

  def readTemporaryFile(path: Path): IO[Array[Byte]] =
    IO.blocking(Files.readAllBytes(path))

  private def resolveWithin(root: Path, relativeKey: String): IO[Path] =
    val base = root.toAbsolutePath.normalize
    val target = base.resolve(relativeKey).normalize
    if target.startsWith(base) then IO.pure(target)
    else IO.raiseError(new IllegalArgumentException(s"非法的照片存储 key: $relativeKey"))

  private def deleteDirectory(directory: Path): IO[Unit] =
    Resource
      .fromAutoCloseable(IO.blocking(Files.list(directory)))
      .use(entries => IO.blocking {
        entries.forEach(entry => Files.deleteIfExists(entry))
        ()
      })
      .guarantee(IO.blocking(Files.deleteIfExists(directory)).void)
