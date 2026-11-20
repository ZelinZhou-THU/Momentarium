package services.gallery.utils

import java.nio.file.Path
import java.util.UUID

import cats.effect.IO
import scala.util.Try

import services.gallery.objects.{ExhibitionId, PhotoFormat}

/** 场景渲染封面的存储约定：key 全部由服务端生成，文件落在 DATA_DIR/renders/{exhibitionId}/ 下。 */
private[gallery] object CoverRenderFiles:
  /** 单文件上限 4MB（api-contract §5.3）。 */
  val MaxCoverBytes: Long = 4L * 1024 * 1024

  /** 长边上限（api-contract §5.3）。 */
  val MaxCoverLongEdge: Int = 2048

  private val AllowedFormats: Set[PhotoFormat] = Set(PhotoFormat.Jpeg, PhotoFormat.Png)

  private val CandidateFormats: List[PhotoFormat] = List(PhotoFormat.Jpeg, PhotoFormat.Png)

  def isAllowedFormat(format: PhotoFormat): Boolean = AllowedFormats.contains(format)

  def storageKey(exhibitionId: ExhibitionId, renderKey: UUID, format: PhotoFormat): String =
    s"renders/${exhibitionId.value}/${renderKey.toString}.${format.fileExtension}"

  /** renderKey 必须是 UUID 且本展览目录下存在对应文件；存在即说明来自本展览的上传。 */
  def locate(
    dataDirectory: Path,
    exhibitionId: ExhibitionId,
    rawRenderKey: String
  ): IO[Option[(String, PhotoFormat)]] =
    parseRenderKey(rawRenderKey) match
      case None => IO.pure(None)
      case Some(renderKey) =>
        CandidateFormats.foldLeft(IO.pure(Option.empty[(String, PhotoFormat)])) { (found, format) =>
          found.flatMap {
            case some @ Some(_) => IO.pure(some)
            case None =>
              val key = storageKey(exhibitionId, renderKey, format)
              PhotoStorage.exists(dataDirectory, key).map {
                case true => Some((key, format))
                case false => None
              }
          }
        }

  def parseRenderKey(raw: String): Option[UUID] =
    Try(UUID.fromString(raw)).toOption.filter(_.toString.equalsIgnoreCase(raw))
