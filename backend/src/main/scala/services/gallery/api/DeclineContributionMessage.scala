package services.gallery.api

import java.sql.Connection

import cats.effect.IO
import cats.syntax.all.*

import services.gallery.objects.{ContributionId, ContributionStatus}
import services.gallery.objects.apiTypes.ContributionSummary
import services.gallery.tables.{ContributionTable, ExhibitionTable, PhotoMemoryTable}
import services.gallery.utils.{ContributionLookups, CurrentTime}
import services.system.api.{APIWithTokenMessage, ApiError, ApiException, ConflictReason}
import services.system.db.Transaction
import services.users.objects.UserId

/** declinecontribution（v1.10）：策展人不采用一条已提交且未被采用的投稿，返回更新后的摘要。
  *
  * submitted → declined（版本不变，写 declined_at）；同版本重复拒绝幂等返回 declined 摘要；
  * 已采用 409 `CONTRIBUTION_ALREADY_ADOPTED`；已撤回 409 `CONTRIBUTION_WITHDRAWN`；
  * expectedVersion 不符 409 `CONTRIBUTION_VERSION_CONFLICT`；draft 不进入审阅，按不可见 404。 */
final case class DeclineContributionMessage(userId: UserId, contributionId: ContributionId, expectedVersion: Int)
    extends APIWithTokenMessage[ContributionSummary]:
  override def plan(connection: Connection): IO[ContributionSummary] =
    Transaction(connection) {
      for
        contribution <- ContributionTable.findById(connection, contributionId).flatMap {
                          case Some(found) => IO.pure(found)
                          case None => IO.raiseError(DeclineContributionMessage.notFound)
                        }
        _ <- ExhibitionTable.requireOwned(connection, contribution.exhibitionId, userId).adaptError {
               case _: ApiException => DeclineContributionMessage.notFound
             }
        _ <- contribution.status match
               case ContributionStatus.Submitted => IO.unit
               case ContributionStatus.Declined => IO.unit
               case ContributionStatus.Withdrawn =>
                 IO.raiseError(ApiException(ApiError.conflict(ConflictReason.ContributionWithdrawn, "投稿已撤回")))
               case ContributionStatus.Draft => IO.raiseError(DeclineContributionMessage.notFound)
        _ <- IO.raiseUnless(contribution.version == expectedVersion)(
               ApiException(ApiError.conflict(ConflictReason.ContributionVersionConflict, "投稿版本已变化，请刷新后重试"))
             )
        adopted <- PhotoMemoryTable.findByContributionId(connection, contribution.id)
        _ <- IO.raiseWhen(adopted.isDefined)(
               ApiException(ApiError.conflict(ConflictReason.ContributionAlreadyAdopted, "投稿已被采用，不能拒绝"))
             )
        now <- CurrentTime.now
        _ <-
          if contribution.status == ContributionStatus.Submitted then
            ContributionTable.decline(connection, contribution.id, expectedVersion, now).flatMap { rows =>
              IO.raiseWhen(rows == 0)(
                ApiException(ApiError.conflict(ConflictReason.ContributionVersionConflict, "投稿版本已变化，请刷新后重试"))
              )
            }
          else IO.unit
        updated <- ContributionTable.findById(connection, contribution.id).flatMap {
                     case Some(found) => IO.pure(found)
                     case None => IO.raiseError(DeclineContributionMessage.notFound)
                   }
        summary <- ContributionLookups.summary(connection, updated)
      yield summary
    }

object DeclineContributionMessage:
  private val notFound: ApiException = ApiException(ApiError.notFound("投稿不存在"))
