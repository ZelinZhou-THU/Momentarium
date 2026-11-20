package services.gallery.api

import java.sql.Connection

import cats.effect.IO
import cats.syntax.all.*

import services.gallery.objects.apiTypes.{ContributionManagementResponse, ContributorView}
import services.gallery.tables.{ContributionInviteTable, ContributionTable, ExhibitionContributorTable, ExhibitionTable}
import services.gallery.utils.ContributionViews
import services.system.api.APIWithTokenMessage
import services.users.objects.UserId
import services.users.tables.{ProfileTable, UserTable}

/** getcontributionmanagement：创建者一次读取本展览的邀请链接与参与者（含 visible 投稿数）。 */
final case class GetContributionManagementMessage(userId: UserId, exhibitionId: services.gallery.objects.ExhibitionId)
    extends APIWithTokenMessage[ContributionManagementResponse]:
  override def plan(connection: Connection): IO[ContributionManagementResponse] =
    for
      _ <- ExhibitionTable.requireOwned(connection, exhibitionId, userId)
      invites <- ContributionInviteTable.listByExhibition(connection, exhibitionId)
      contributors <- ExhibitionContributorTable.listByExhibition(connection, exhibitionId)
      counts <- ContributionTable.countVisibleGroupedByContributor(connection, exhibitionId)
      participants <- contributors.traverse(contributor => participantView(connection, contributor, counts.getOrElse(contributor.userId, 0)))
    yield ContributionManagementResponse(
      invites = invites.map(ContributionViews.inviteSummary),
      participants = participants.flatten
    )

  /** 用户行被删除时跳过该参与者（无外键，仅保留历史行）。 */
  private def participantView(
    connection: Connection,
    contributor: services.gallery.objects.ExhibitionContributor,
    contributionCount: Int
  ): IO[Option[ContributorView]] =
    for
      user <- UserTable.findById(connection, contributor.userId)
      profile <- ProfileTable.findByUserId(connection, contributor.userId)
    yield user.map(found => ContributionViews.contributorView(found, profile, contributor, contributionCount))
