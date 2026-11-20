package services.curation.utils

import java.nio.file.Path
import java.sql.Connection
import java.time.Instant

import cats.effect.IO
import cats.syntax.all.*
import fs2.Stream
import org.slf4j.LoggerFactory

import services.curation.objects.PhotoAnalysisRecord
import services.curation.tables.PhotoAnalysisTable
import services.curation.utils.prompts.PhotoAnalysisPrompts
import services.gallery.api.GetPhotoContentMessage
import services.gallery.objects.{ExhibitionPhoto, PhotoId, PhotoVariant}
import services.system.ai.AiPorts
import services.system.api.{ApiError, ApiException}
import services.users.objects.UserId

/**
 * 照片分析的缓存编排（spec 10.1）：命中缓存直接用；缺失照片并发 4 逐张分析，单张失败重试 1 次，
 * 全部失败（且无缓存）才抛 MODEL_FAILURE。单张失败不中断整批。
 */
private[curation] object PhotoAnalyses:

  val MaxConcurrent = 4

  private val logger = LoggerFactory.getLogger(getClass)

  def ensure(
    connection: Connection,
    userId: UserId,
    photos: List[ExhibitionPhoto],
    dataDirectory: Path,
    sessionId: String,
    model: String,
    ai: AiPorts,
    now: Instant
  ): IO[Map[PhotoId, PhotoAnalysisRecord]] =
    for
      cached <- PhotoAnalysisTable.findByIds(connection, photos.map(_.id))
      cachedById = cached.map(record => record.photoId -> record).toMap
      missing = photos.filterNot(photo => cachedById.contains(photo.id))
      analyzed <- Stream
                    .emits(missing)
                    .covary[IO]
                    .parEvalMap(MaxConcurrent)(photo =>
                      analyzeWithRetry(connection, userId, photo, dataDirectory, sessionId, model, ai, now).attempt
                    )
                    .compile
                    .toList
      fresh = analyzed.collect { case Right(record) => record }
      _ <- analyzed
             .collect { case Left(error) => error }
             .traverse_(error => IO(logger.warn(s"照片分析失败（不影响整批）：${describe(error)}")))
      _ <- IO.raiseWhen(photos.nonEmpty && cachedById.isEmpty && fresh.isEmpty)(
             ApiException(ApiError.modelFailure("照片分析全部失败，请稍后重试"))
           )
    yield cachedById ++ fresh.map(record => record.photoId -> record).toMap

  private def analyzeWithRetry(
    connection: Connection,
    userId: UserId,
    photo: ExhibitionPhoto,
    dataDirectory: Path,
    sessionId: String,
    model: String,
    ai: AiPorts,
    now: Instant
  ): IO[PhotoAnalysisRecord] =
    analyzeOnce(connection, userId, photo, dataDirectory, sessionId, model, ai, now).attempt.flatMap {
      case Right(record) => IO.pure(record)
      case Left(error) =>
        IO(logger.warn(s"照片分析首次失败，重试 1 次（photoId=${photo.id.value}）：${describe(error)}")) *>
          analyzeOnce(connection, userId, photo, dataDirectory, sessionId, model, ai, now)
    }

  private def analyzeOnce(
    connection: Connection,
    userId: UserId,
    photo: ExhibitionPhoto,
    dataDirectory: Path,
    sessionId: String,
    model: String,
    ai: AiPorts,
    now: Instant
  ): IO[PhotoAnalysisRecord] =
    for
      content <- GetPhotoContentMessage(userId, photo.id, PhotoVariant.Full, dataDirectory).plan(connection)
      image <- CurationImages.toAnalysisImage(content.bytes)
      analysis <- ai.vision.analyze(image, PhotoAnalysisPrompts.analyze(sessionId))
      record = PhotoAnalysisRecord(photo.id, analysis, model, now)
      _ <- PhotoAnalysisTable.upsert(connection, record)
    yield record

  private def describe(error: Throwable): String =
    Option(error.getMessage).filter(_.nonEmpty).getOrElse(error.getClass.getSimpleName)
