package services.gallery.api

import java.nio.file.Path
import java.sql.Connection

import cats.effect.IO
import cats.syntax.all.*

import services.gallery.objects.{CoverKind, Exhibition, ExhibitionPhoto, PhotoFormat, Publication}
import services.gallery.objects.apiTypes.{DisplayCopyBackfillFailure, DisplayCopyBackfillReport}
import services.gallery.tables.{ExhibitionPhotoTable, ExhibitionTable, PublicationTable}
import services.gallery.utils.{PhotoStorage, PhotoThumbnails}
import services.system.api.NoRequestMessage

/** 历史展示副本回填（P0-B2）：仅供独立迁移入口调用，不注册路由、不进入常规启动流程。
  *
  * 处理范围：全部 exhibition_photos（含 active 快照引用的归档照片）缺失的展示副本从私有原图生成；
  * 草稿 render 封面与 active 快照引用的 render 封面若含 EXIF/XMP/IPTC/注释等元数据则重编码。
  * 只写展示副本与重编码 render 文件，不动原图与数据库；展示副本已存在的照片跳过，可安全重跑。
  */
final case class BackfillDisplayCopiesMessage(
  dataDirectory: Path
) extends NoRequestMessage[DisplayCopyBackfillReport]:
  override def plan(connection: Connection): IO[DisplayCopyBackfillReport] =
    for
      photos <- ExhibitionPhotoTable.listAll(connection)
      photoResults <- photos.traverse(photo => backfillPhoto(photo))
      exhibitions <- ExhibitionTable.listAll(connection)
      activePublications <- exhibitions.traverse(exhibition => PublicationTable.findActive(connection, exhibition.id))
      renderKeys = BackfillDisplayCopiesMessage.renderStorageKeys(exhibitions, activePublications.flatten)
      renderResults <- renderKeys.traverse(storageKey => backfillRender(storageKey))
    yield BackfillDisplayCopiesMessage.report(photos.size, photoResults, renderKeys.size, renderResults)

  private def backfillPhoto(photo: ExhibitionPhoto): IO[Either[DisplayCopyBackfillFailure, BackfillDisplayCopiesMessage.PhotoOutcome]] =
    val displayKey = PhotoStorage.displayKey(photo.exhibitionId, photo.id)
    PhotoStorage.exists(dataDirectory, displayKey).flatMap {
      case true => IO.pure(Right(BackfillDisplayCopiesMessage.PhotoOutcome.Skipped))
      case false =>
        PhotoStorage.readOption(dataDirectory, photo.storageKey).flatMap {
          case None => IO.pure(Left(failure(photo, "原图缺失，无法生成展示副本")))
          case Some(originalBytes) =>
            PhotoThumbnails.process(originalBytes).flatMap {
              case None => IO.pure(Left(failure(photo, "原图无法解码")))
              case Some(image) =>
                PhotoStorage
                  .write(dataDirectory, displayKey, image.displayJpeg)
                  .as(Right(BackfillDisplayCopiesMessage.PhotoOutcome.Generated))
            }
        }
    }.attempt.map {
      case Right(result) => result
      case Left(error) => Left(failure(photo, describe(error)))
    }

  private def backfillRender(
    storageKey: String
  ): IO[Either[DisplayCopyBackfillFailure, BackfillDisplayCopiesMessage.RenderOutcome]] =
    val subject = storageKey.split('/').lastOption.getOrElse(storageKey)
    PhotoStorage.readOption(dataDirectory, storageKey).flatMap {
      case None => IO.pure(Left(DisplayCopyBackfillFailure(subject, "render 封面文件缺失")))
      case Some(bytes) =>
        if !PhotoThumbnails.hasMetadata(bytes) then IO.pure(Right(BackfillDisplayCopiesMessage.RenderOutcome.Skipped))
        else
          PhotoFormat.fromBytes(bytes.take(PhotoFormat.ProbeLength)) match
            case None => IO.pure(Left(DisplayCopyBackfillFailure(subject, "render 封面无法识别格式")))
            case Some(format) =>
              PhotoThumbnails.sanitize(bytes, format).flatMap {
                case None => IO.pure(Left(DisplayCopyBackfillFailure(subject, "render 封面重编码失败")))
                case Some(sanitized) =>
                  PhotoStorage
                    .write(dataDirectory, storageKey, sanitized.bytes)
                    .as(Right(BackfillDisplayCopiesMessage.RenderOutcome.Reencoded))
              }
    }.attempt.map {
      case Right(result) => result
      case Left(error) => Left(DisplayCopyBackfillFailure(subject, describe(error)))
    }

  private def failure(photo: ExhibitionPhoto, reason: String): DisplayCopyBackfillFailure =
    DisplayCopyBackfillFailure(photo.id.value.toString, reason)

  private def describe(error: Throwable): String =
    error.getClass.getSimpleName

object BackfillDisplayCopiesMessage:
  /** 渲染封面是否需要检查：草稿 render 封面 + active 快照 render 封面（去重、稳定顺序）。 */
  private[gallery] def renderStorageKeys(
    exhibitions: List[Exhibition],
    activePublications: List[Publication]
  ): List[String] =
    val draftKeys = exhibitions.filter(_.coverKind == CoverKind.Render).flatMap(_.coverStorageKey)
    val snapshotKeys = activePublications
      .filter(publication => publication.snapshot.cover.kind == CoverKind.Render)
      .flatMap(_.snapshot.cover.storageKey)
    (draftKeys ++ snapshotKeys).distinct.sorted

  private[gallery] def report(
    photosTotal: Int,
    photoResults: List[Either[DisplayCopyBackfillFailure, PhotoOutcome]],
    rendersTotal: Int,
    renderResults: List[Either[DisplayCopyBackfillFailure, RenderOutcome]]
  ): DisplayCopyBackfillReport =
    DisplayCopyBackfillReport(
      photosTotal = photosTotal,
      photosGenerated = photoResults.count {
        case Right(PhotoOutcome.Generated) => true
        case _ => false
      },
      photosSkipped = photoResults.count {
        case Right(PhotoOutcome.Skipped) => true
        case _ => false
      },
      photoFailures = photoResults.collect { case Left(failure) => failure },
      rendersTotal = rendersTotal,
      rendersReencoded = renderResults.count {
        case Right(RenderOutcome.Reencoded) => true
        case _ => false
      },
      rendersSkipped = renderResults.count {
        case Right(RenderOutcome.Skipped) => true
        case _ => false
      },
      renderFailures = renderResults.collect { case Left(failure) => failure }
    )

  private[gallery] enum PhotoOutcome:
    case Generated
    case Skipped

  private[gallery] enum RenderOutcome:
    case Reencoded
    case Skipped
