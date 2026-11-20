package services.gallery.api

import java.nio.file.Path
import java.sql.Connection

import cats.effect.IO
import cats.syntax.all.*

import services.gallery.objects.{Contribution, ContributionId, ContributionStatus, PhotoContent, PhotoVariant}
import services.gallery.tables.{ContributionTable, ExhibitionTable}
import services.gallery.utils.{PhotoStorage, PhotoThumbnails}
import services.system.api.{APIMessage, ApiError, ApiException}
import services.users.objects.UserId

/** 投稿私有图片读取（二进制路由的业务执行单元）：仅投稿者本人或展览创建者可读；已撤回/无照片 404；
  * 邀请令牌不参与授权（路由只接受登录会话令牌）。 */
final case class GetContributionContentMessage(
  userId: Option[UserId],
  contributionId: ContributionId,
  variant: PhotoVariant,
  dataDirectory: Path
) extends APIMessage[PhotoContent]:
  override def plan(connection: Connection): IO[PhotoContent] =
    for
      contribution <- ContributionTable.findById(connection, contributionId).flatMap {
                        case Some(found) => IO.pure(found)
                        case None => IO.raiseError(GetContributionContentMessage.notFound)
                      }
      _ <- IO.raiseWhen(contribution.status == ContributionStatus.Withdrawn)(
             GetContributionContentMessage.notFound
           )
      caller <- userId match
                  case Some(found) => IO.pure(found)
                  case None => IO.raiseError(ApiException(ApiError.unauthorized("请先登录")))
      _ <- authorize(connection, contribution, caller)
      keyAndMime <- contentOf(contribution)
      bytes <- PhotoStorage.read(dataDirectory, keyAndMime._1)
    yield PhotoContent(bytes, keyAndMime._2)

  private def authorize(connection: Connection, contribution: Contribution, caller: UserId): IO[Unit] =
    if contribution.contributorId == caller then IO.unit
    else
      ExhibitionTable.findById(connection, contribution.exhibitionId).flatMap {
        case Some(exhibition) if exhibition.ownerId == caller => IO.unit
        case _ => IO.raiseError(GetContributionContentMessage.notFound)
      }

  /** 纯文字投稿没有图片文件，按不存在处理。 */
  private def contentOf(contribution: Contribution): IO[(String, String)] =
    variant match
      case PhotoVariant.Thumb =>
        contribution.thumbKey match
          case Some(key) => IO.pure((key, PhotoThumbnails.ThumbnailMimeType))
          case None => IO.raiseError(GetContributionContentMessage.notFound)
      case PhotoVariant.Full =>
        (contribution.originalKey, contribution.mime) match
          case (Some(key), Some(mime)) => IO.pure((key, mime))
          case _ => IO.raiseError(GetContributionContentMessage.notFound)

object GetContributionContentMessage:
  private val notFound: ApiException = ApiException(ApiError.notFound("投稿不存在"))
