package services.gallery.api

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.ExhibitionId
import services.gallery.tables.{ExhibitionContributorTable, ExhibitionTable}
import services.gallery.utils.CurrentTime
import services.system.api.{APIWithTokenMessage, ApiError, ApiException, EmptyResponse}
import services.system.db.Transaction
import services.users.objects.UserId

/** revokecontributor：创建者撤销参与关系（终态）；已撤销/不存在时幂等或 404，不删除已采用副本。 */
final case class RevokeContributorMessage(userId: UserId, exhibitionId: ExhibitionId, contributorId: UserId)
    extends APIWithTokenMessage[EmptyResponse]:
  override def plan(connection: Connection): IO[EmptyResponse] =
    Transaction(connection) {
      for
        _ <- ExhibitionTable.requireOwned(connection, exhibitionId, userId)
        _ <- ExhibitionContributorTable.find(connection, exhibitionId, contributorId).flatMap {
               case Some(_) => IO.unit
               case None => IO.raiseError(ApiException(ApiError.notFound("参与者不存在")))
             }
        now <- CurrentTime.now
        _ <- ExhibitionContributorTable.revoke(connection, exhibitionId, contributorId, now)
      yield EmptyResponse()
    }
