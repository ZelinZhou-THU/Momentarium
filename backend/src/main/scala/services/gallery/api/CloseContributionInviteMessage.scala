package services.gallery.api

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.apiTypes.ContributionInviteSummary
import services.gallery.tables.{ContributionInviteTable, ExhibitionTable}
import services.gallery.utils.{ContributionViews, CurrentTime}
import services.system.api.{APIWithTokenMessage, ApiError, ApiException}
import services.system.db.Transaction
import services.users.objects.UserId

/** closecontributioninvite：创建者关闭邀请链接（阻止新加入，不撤销已有参与者）；已关闭幂等返回。 */
final case class CloseContributionInviteMessage(
  userId: UserId,
  exhibitionId: services.gallery.objects.ExhibitionId,
  inviteId: services.gallery.objects.ContributionInviteId
) extends APIWithTokenMessage[ContributionInviteSummary]:
  override def plan(connection: Connection): IO[ContributionInviteSummary] =
    Transaction(connection) {
      for
        _ <- ExhibitionTable.requireOwned(connection, exhibitionId, userId)
        _ <- ContributionInviteTable.findById(connection, exhibitionId, inviteId).flatMap {
               case Some(_) => IO.unit
               case None => IO.raiseError(ApiException(ApiError.notFound("邀请链接不存在")))
             }
        now <- CurrentTime.now
        _ <- ContributionInviteTable.close(connection, exhibitionId, inviteId, now)
        updated <- ContributionInviteTable.findById(connection, exhibitionId, inviteId).flatMap {
                     case Some(invite) => IO.pure(invite)
                     case None => IO.raiseError(ApiException(ApiError.notFound("邀请链接不存在")))
                   }
      yield ContributionViews.inviteSummary(updated)
    }
