package services.gallery.api

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.apiTypes.ContributionInvitePreview
import services.gallery.tables.{ContributionInviteTable, ExhibitionTable}
import services.gallery.utils.{ContributionInvites, ContributionLookups, ContributionViews}
import services.system.api.{APIMessage, ApiError, ApiException}

/** getcontributioninvite（公开，凭令牌）：只返回展览标题、邀请人展示名（v1.17）与链接状态；无效令牌统一 404，关闭返回 status=closed。 */
final case class GetContributionInviteMessage(token: String) extends APIMessage[ContributionInvitePreview]:
  override def plan(connection: Connection): IO[ContributionInvitePreview] =
    val rawToken = token.trim
    if rawToken.isEmpty then IO.raiseError(GetContributionInviteMessage.invalidInvite)
    else
      ContributionInviteTable.findByTokenHash(connection, ContributionInvites.hash(rawToken)).flatMap {
        case None => IO.raiseError(GetContributionInviteMessage.invalidInvite)
        case Some(invite) =>
          ExhibitionTable.findById(connection, invite.exhibitionId).flatMap {
            case Some(exhibition) =>
              ContributionLookups
                .contributorBrief(connection, exhibition.ownerId)
                .map(inviter => ContributionViews.invitePreview(exhibition.title, inviter.displayName, invite))
            case None => IO.raiseError(GetContributionInviteMessage.invalidInvite)
          }
      }

object GetContributionInviteMessage:
  private val invalidInvite: ApiException = ApiException(ApiError.notFound("邀请链接无效"))
