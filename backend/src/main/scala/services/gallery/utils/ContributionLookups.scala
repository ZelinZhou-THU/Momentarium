package services.gallery.utils

import java.sql.Connection

import cats.effect.IO
import cats.syntax.all.*

import services.gallery.objects.{Contribution, Exhibition}
import services.gallery.objects.apiTypes.{ContributionSummary, ContributorBrief}
import services.gallery.tables.{ExhibitionTable, PhotoMemoryTable, PublicationTable}
import services.system.api.{ApiError, ApiException}
import services.users.objects.{Profile, User}
import services.users.tables.{ProfileTable, UserTable}

/** 投稿 DTO 装配所需的读取：展览标题、投稿者资料与采用状态；不存在按 404 处理（内部一致性兜底）。 */
private[gallery] object ContributionLookups:
  def exhibition(connection: Connection, exhibitionId: services.gallery.objects.ExhibitionId): IO[Exhibition] =
    ExhibitionTable.findById(connection, exhibitionId).flatMap {
      case Some(exhibition) => IO.pure(exhibition)
      case None => IO.raiseError(ApiException(ApiError.notFound("展览不存在")))
    }

  def user(connection: Connection, userId: services.users.objects.UserId): IO[User] =
    UserTable.findById(connection, userId).flatMap {
      case Some(user) => IO.pure(user)
      case None => IO.raiseError(ApiException(ApiError.notFound("用户不存在")))
    }

  def profile(connection: Connection, userId: services.users.objects.UserId): IO[Option[Profile]] =
    ProfileTable.findByUserId(connection, userId)

  def contributorBrief(connection: Connection, userId: services.users.objects.UserId): IO[ContributorBrief] =
    for
      user <- user(connection, userId)
      profile <- profile(connection, userId)
    yield ContributionViews.contributorBrief(user, profile)

  def summary(connection: Connection, contribution: Contribution): IO[ContributionSummary] =
    for
      exhibition <- exhibition(connection, contribution.exhibitionId)
      brief <- contributorBrief(connection, contribution.contributorId)
      adoption <- PhotoMemoryTable.findByContributionId(connection, contribution.id)
      publication <- PublicationTable.findActive(connection, contribution.exhibitionId)
    yield ContributionViews.summary(contribution, exhibition.title, brief, adoption, publication)

  def summaries(connection: Connection, contributions: List[Contribution]): IO[List[ContributionSummary]] =
    contributions.traverse(contribution => summary(connection, contribution))
