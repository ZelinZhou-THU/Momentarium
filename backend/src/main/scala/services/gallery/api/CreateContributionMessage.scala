package services.gallery.api

import java.sql.Connection

import cats.effect.IO
import cats.syntax.all.*

import services.gallery.objects.{Contribution, ContributionId, ContributionLimits, ContributionStatus}
import services.gallery.objects.apiTypes.{ContributionLocationInput, ContributionSummary}
import services.gallery.tables.ContributionTable
import services.gallery.utils.{ContributionAccess, ContributionCaptions, ContributionLocations, ContributionLookups, CurrentTime}
import services.system.api.{APIWithTokenMessage, ApiError, ApiException, ValidationReason}
import services.system.db.Transaction
import services.users.objects.UserId

/** createcontribution（v1.12）：只创建 draft 投稿（回忆可空，可附建议图注与位置），不再直接提交。
  *
  * 照片通过投稿上传附加；带图且回忆 1–1000 码点后由 updatecontribution submit=true 提交审阅。
  * 只能由 active 投稿者创建、不能投稿自己的展览；纯文字/无图草稿不占照片配额。 */
final case class CreateContributionMessage(
  userId: UserId,
  exhibitionId: services.gallery.objects.ExhibitionId,
  memoryText: String,
  suggestedCaption: Option[String],
  location: Option[ContributionLocationInput]
) extends APIWithTokenMessage[ContributionSummary]:
  override def plan(connection: Connection): IO[ContributionSummary] =
    Transaction(connection) {
      for
        validMemory <- requireMemory(memoryText)
        validCaption <- ContributionCaptions.normalize(suggestedCaption)
        validLocation <- location.traverse(ContributionLocations.normalize)
        _ <- ContributionAccess.requireActiveContributor(connection, exhibitionId, userId)
        now <- CurrentTime.now
        contributionId <- IO.randomUUID.map(ContributionId.apply)
        contribution = Contribution(
                         id = contributionId,
                         exhibitionId = exhibitionId,
                         contributorId = userId,
                         status = ContributionStatus.Draft,
                         version = 1,
                         memoryText = validMemory,
                         suggestedCaption = validCaption,
                         originalName = None,
                         mime = None,
                         width = None,
                         height = None,
                         originalKey = None,
                         thumbKey = None,
                         displayKey = None,
                         originalBytes = None,
                         derivedBytes = None,
                         locationName = validLocation.map(_.name).getOrElse(""),
                         latitude = validLocation.flatMap(_.latitude),
                         longitude = validLocation.flatMap(_.longitude),
                         locationSource = ContributionLocations.contributorSource,
                         createdAt = now,
                         updatedAt = now,
                         withdrawnAt = None,
                         declinedAt = None
                       )
        _ <- ContributionTable.insert(connection, contribution)
        summary <- ContributionLookups.summary(connection, contribution)
      yield summary
    }

  /** draft 允许空文字，但不超过 1000 码点。 */
  private def requireMemory(rawMemory: String): IO[String] =
    val memory = rawMemory.trim
    val codePoints = memory.codePointCount(0, memory.length)
    if codePoints <= ContributionLimits.MaxMemoryCodePoints then IO.pure(memory)
    else
      IO.raiseError(
        ApiException(
          ApiError.validation(
            ValidationReason.ContributionMemoryInvalid,
            s"回忆最多 ${ContributionLimits.MaxMemoryCodePoints} 个字符"
          )
        )
      )
