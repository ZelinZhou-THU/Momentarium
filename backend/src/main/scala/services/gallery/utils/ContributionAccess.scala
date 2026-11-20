package services.gallery.utils

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.*
import services.gallery.tables.{ContributionTable, ExhibitionContributorTable, ExhibitionTable}
import services.system.api.{ApiError, ApiException, ConflictReason, ValidationReason}
import services.users.objects.UserId

/** 共同投稿的权限与存在性检查：越权/私有资源统一 404，不泄露存在性；业务状态冲突用 409。 */
private[gallery] object ContributionAccess:
  def requireOwnedExhibition(connection: Connection, exhibitionId: ExhibitionId, ownerId: UserId): IO[Exhibition] =
    ExhibitionTable.requireOwned(connection, exhibitionId, ownerId)

  /** 上传/更新前校验：创建者不能投稿自己的展览；无参与关系 404；被撤销 409。 */
  def requireActiveContributor(
    connection: Connection,
    exhibitionId: ExhibitionId,
    userId: UserId
  ): IO[ExhibitionContributor] =
    for
      exhibition <- ExhibitionTable.findById(connection, exhibitionId).flatMap {
                      case Some(found) => IO.pure(found)
                      case None => IO.raiseError(notFound)
                    }
      _ <- IO.raiseWhen(exhibition.ownerId == userId)(
             ApiException(ApiError.validation(ValidationReason.ContributionSelfNotAllowed, "创建者不能投稿自己的展览"))
           )
      contributor <- ExhibitionContributorTable.find(connection, exhibitionId, userId).flatMap {
                       case None => IO.raiseError(notFound)
                       case Some(found) if found.status == ContributorStatus.Revoked =>
                         IO.raiseError(
                           ApiException(ApiError.conflict(ConflictReason.ParticipantRevoked, "参与关系已被撤销"))
                         )
                       case Some(found) => IO.pure(found)
                     }
    yield contributor

  /** 只读权限：投稿者本人或展览创建者可读，其余（含被撤销参与）本人仍可读自己的稿。 */
  def requireContributionReader(
    connection: Connection,
    contribution: Contribution,
    userId: UserId
  ): IO[Unit] =
    for
      exhibition <- ExhibitionTable.findById(connection, contribution.exhibitionId).flatMap {
                      case Some(found) => IO.pure(found)
                      case None => IO.raiseError(notFound)
                    }
      _ <- IO.raiseUnless(contribution.contributorId == userId || exhibition.ownerId == userId)(notFound)
    yield ()

  def requireContribution(connection: Connection, contributionId: ContributionId): IO[Contribution] =
    ContributionTable.findById(connection, contributionId).flatMap {
      case Some(contribution) => IO.pure(contribution)
      case None => IO.raiseError(notFound)
    }

  /** 投稿者读取/更新自己的稿：不是本人一律 404。 */
  def requireOwnContribution(
    connection: Connection,
    contributionId: ContributionId,
    contributorId: UserId
  ): IO[Contribution] =
    requireContribution(connection, contributionId).flatMap { contribution =>
      IO.raiseUnless(contribution.contributorId == contributorId)(notFound).as(contribution)
    }

  /** 采用前置条件：withdrawn 409、declined 409 CONTRIBUTION_DECLINED、draft 视为不可见 404。 */
  def requireAdoptable(contribution: Contribution): IO[Contribution] =
    contribution.status match
      case ContributionStatus.Submitted => IO.pure(contribution)
      case ContributionStatus.Withdrawn =>
        IO.raiseError(ApiException(ApiError.conflict(ConflictReason.ContributionWithdrawn, "投稿已撤回")))
      case ContributionStatus.Declined =>
        IO.raiseError(ApiException(ApiError.conflict(ConflictReason.ContributionDeclined, "投稿已被不采用，需修改后重新提交")))
      case ContributionStatus.Draft => IO.raiseError(notFound)

  private val notFound: ApiException = ApiException(ApiError.notFound("投稿不存在"))
