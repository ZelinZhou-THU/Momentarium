package services.gallery.api

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.*
import services.gallery.objects.apiTypes.ContributionMembershipView
import services.gallery.tables.{ContributionInviteTable, ExhibitionContributorTable, ExhibitionTable}
import services.gallery.utils.{ContributionInvites, ContributionViews, CurrentTime}
import services.system.api.{APIWithTokenMessage, ApiError, ApiException, ConflictReason, ValidationReason}
import services.system.db.Transaction
import services.users.objects.UserId

/** joincontribution：登录用户凭有效邀请令牌兑换加入；已 active 幂等，关闭 409，被撤销 409，自加入 400。 */
final case class JoinContributionMessage(userId: UserId, token: String)
    extends APIWithTokenMessage[ContributionMembershipView]:
  override def plan(connection: Connection): IO[ContributionMembershipView] =
    Transaction(connection) {
      for
        now <- CurrentTime.now
        invite <- validInvite(connection)
        exhibition <- ExhibitionTable.findById(connection, invite.exhibitionId).flatMap {
                        case Some(found) => IO.pure(found)
                        case None => IO.raiseError(JoinContributionMessage.invalidInvite)
                      }
        _ <- IO.raiseWhen(exhibition.ownerId == userId)(
               ApiException(ApiError.validation(ValidationReason.ContributionSelfNotAllowed, "创建者不能加入自己的展览"))
             )
        _ <- IO.raiseWhen(invite.status == ContributionInviteStatus.Closed)(
               ApiException(ApiError.conflict(ConflictReason.InviteClosed, "邀请链接已关闭"))
             )
        existing <- ExhibitionContributorTable.find(connection, exhibition.id, userId)
        contributor <- existing match
                         case Some(found) if found.status == ContributorStatus.Revoked =>
                           IO.raiseError(
                             ApiException(ApiError.conflict(ConflictReason.ParticipantRevoked, "参与关系已被撤销"))
                           )
                         case Some(found) => IO.pure(found)
                         case None => join(connection, exhibition, invite, now)
      yield ContributionViews.membershipView(exhibition.title, contributor)
    }

  private def validInvite(connection: Connection): IO[ContributionInvite] =
    val rawToken = token.trim
    if rawToken.isEmpty then IO.raiseError(JoinContributionMessage.invalidInvite)
    else
      ContributionInviteTable.findByTokenHash(connection, ContributionInvites.hash(rawToken)).flatMap {
        case Some(invite) => IO.pure(invite)
        case None => IO.raiseError(JoinContributionMessage.invalidInvite)
      }

  private def join(
    connection: Connection,
    exhibition: Exhibition,
    invite: ContributionInvite,
    now: java.time.Instant
  ): IO[ExhibitionContributor] =
    val contributor = ExhibitionContributor(
      exhibitionId = exhibition.id,
      userId = userId,
      inviteId = Some(invite.id),
      status = ContributorStatus.Active,
      joinedAt = now,
      revokedAt = None,
      updatedAt = now
    )
    ExhibitionContributorTable.insertIfAbsent(connection, contributor) *>
      ExhibitionContributorTable.find(connection, exhibition.id, userId).map(_.getOrElse(contributor))

object JoinContributionMessage:
  private val invalidInvite: ApiException = ApiException(ApiError.notFound("邀请链接无效"))
