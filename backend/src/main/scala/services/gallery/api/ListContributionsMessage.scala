package services.gallery.api

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.ExhibitionId
import services.gallery.objects.apiTypes.ContributionsResponse
import services.gallery.tables.{ContributionTable, ExhibitionContributorTable, ExhibitionTable}
import services.gallery.utils.ContributionLookups
import services.system.api.{APIWithTokenMessage, ApiError, ApiException}
import services.users.objects.UserId

/** listcontributions：创建者传自己的展览进入审阅范围（submitted/withdrawn，不含 draft）；
  * 投稿者看自己的全部状态、可传自己的展览过滤；无 exhibitionId 时返回自己的投稿（跨展览）。 */
final case class ListContributionsMessage(userId: UserId, exhibitionId: Option[ExhibitionId])
    extends APIWithTokenMessage[ContributionsResponse]:
  override def plan(connection: Connection): IO[ContributionsResponse] =
    exhibitionId match
      case None =>
        ContributionTable
          .listByContributor(connection, userId, None)
          .flatMap(contributions => ContributionLookups.summaries(connection, contributions))
          .map(ContributionsResponse.apply)
      case Some(scopedId) =>
        ExhibitionTable.findById(connection, scopedId).flatMap {
          case None => IO.raiseError(ListContributionsMessage.notFound)
          case Some(exhibition) if exhibition.ownerId == userId =>
            ContributionTable
              .listForExhibitionReview(connection, scopedId)
              .flatMap(contributions => ContributionLookups.summaries(connection, contributions))
              .map(ContributionsResponse.apply)
          case Some(_) =>
            ExhibitionContributorTable.find(connection, scopedId, userId).flatMap {
              case None => IO.raiseError(ListContributionsMessage.notFound)
              case Some(_) =>
                ContributionTable
                  .listByContributor(connection, userId, Some(scopedId))
                  .flatMap(contributions => ContributionLookups.summaries(connection, contributions))
                  .map(ContributionsResponse.apply)
            }
        }

object ListContributionsMessage:
  private val notFound: ApiException = ApiException(ApiError.notFound("展览不存在或不可见"))
