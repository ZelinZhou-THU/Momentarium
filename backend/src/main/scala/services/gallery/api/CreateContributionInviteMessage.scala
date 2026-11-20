package services.gallery.api

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.{ContributionInvite, ContributionInviteId, ContributionInviteStatus}
import services.gallery.objects.apiTypes.ContributionInviteCreated
import services.gallery.tables.{ContributionInviteTable, ExhibitionTable}
import services.gallery.utils.{ContributionInvites, CurrentTime}
import services.system.api.APIWithTokenMessage
import services.system.db.Transaction
import services.users.objects.UserId

/** createcontributioninvite：创建者为其展览生成可关闭的邀请链接；明文令牌只在响应返回一次。 */
final case class CreateContributionInviteMessage(userId: UserId, exhibitionId: services.gallery.objects.ExhibitionId)
    extends APIWithTokenMessage[ContributionInviteCreated]:
  override def plan(connection: Connection): IO[ContributionInviteCreated] =
    Transaction(connection) {
      for
        _ <- ExhibitionTable.requireOwned(connection, exhibitionId, userId)
        now <- CurrentTime.now
        rawToken <- ContributionInvites.generateToken
        inviteId <- IO.randomUUID.map(ContributionInviteId.apply)
        invite = ContributionInvite(
                   id = inviteId,
                   exhibitionId = exhibitionId,
                   tokenHash = ContributionInvites.hash(rawToken),
                   status = ContributionInviteStatus.Active,
                   createdBy = userId,
                   createdAt = now,
                   closedAt = None
                 )
        _ <- ContributionInviteTable.insert(connection, invite)
      yield ContributionInviteCreated(inviteId, rawToken, now)
    }
