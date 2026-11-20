package services.gallery.api

import java.sql.Connection

import cats.effect.IO
import cats.syntax.all.*

import services.gallery.objects.{ContributionId, ContributionLimits, ContributionStatus, ContributorStatus}
import services.gallery.objects.apiTypes.{ContributionLocationInput, ContributionSummary}
import services.gallery.tables.{ContributionTable, ExhibitionContributorTable}
import services.gallery.utils.{
  ContributionAccess,
  ContributionCaptions,
  ContributionLocations,
  ContributionLookups,
  ContributionViews,
  CurrentTime,
  PhotoStorage
}
import services.system.api.{APIWithTokenMessage, ApiError, ApiException, ConflictReason, ValidationReason}
import services.system.db.Transaction
import services.system.startup.AppRuntime
import services.users.objects.UserId

/** updatecontribution（v1.12）：保存草稿、补图提交、移除草稿照片与修改建议图注。
  *
  * - submit=true：必须已有照片（否则 400 `CONTRIBUTION_PHOTO_REQUIRED`），回忆 1–1000 码点；
  *   draft/declined/submitted → submitted（历史纯文字 submitted/declined 不能提交，需先补图）；
  * - removePhoto=true：仅当前 draft 可移除照片（清空图片列与文件、保持 draft）；
  *   对 submitted/declined 返回 400 `CONTRIBUTION_PHOTO_REQUIRED`；
  * - submit=false：保存（declined → draft，其余状态保持；submitted 编辑后 owner 看到待确认）；
  * - suggestedCaption 为 null 时清空建议图注（修改建议图注不会自动改已采用草稿的图注）；
  * - 版本仅在内容/建议图注/照片变化时 +1；撤回稿与被撤销参与拒绝。 */
final case class UpdateContributionMessage(
  userId: UserId,
  contributionId: ContributionId,
  memoryText: String,
  suggestedCaption: Option[String],
  location: Option[ContributionLocationInput],
  submit: Boolean,
  removePhoto: Boolean
) extends APIWithTokenMessage[ContributionSummary]:
  override def plan(connection: Connection): IO[ContributionSummary] =
    for
      dataDirectory <- AppRuntime.config.map(_.dataDir)
      staleFiles <- IO.ref(List.empty[String])
      summary <- Transaction(connection) {
                   for
                     validMemory <- requireMemory(memoryText, submit)
                     validCaption <- ContributionCaptions.normalize(suggestedCaption)
                     validLocation <- location.traverse(ContributionLocations.normalize)
                     contribution <- ContributionAccess.requireOwnContribution(connection, contributionId, userId)
                     _ <- IO.raiseWhen(contribution.status == ContributionStatus.Withdrawn)(
                            ApiException(ApiError.conflict(ConflictReason.ContributionWithdrawn, "投稿已撤回"))
                          )
                     _ <- ExhibitionContributorTable.find(connection, contribution.exhibitionId, userId).flatMap {
                            case Some(contributor) if contributor.status == ContributorStatus.Active => IO.unit
                            case Some(_) =>
                              IO.raiseError(ApiException(ApiError.conflict(ConflictReason.ParticipantRevoked, "参与关系已被撤销")))
                            case None => IO.raiseError(ApiException(ApiError.notFound("投稿不存在")))
                          }
                     hasPhoto = ContributionViews.hasPhoto(contribution)
                     // 提交必须带图；移除照片仅 draft 可做（提交后图不可删）。
                     _ <- IO.raiseWhen(submit && (removePhoto || !hasPhoto))(
                            UpdateContributionMessage.photoRequired
                          )
                     _ <- IO.raiseWhen(removePhoto && contribution.status != ContributionStatus.Draft)(
                            UpdateContributionMessage.photoRequired
                          )
                     now <- CurrentTime.now
                     targetStatus =
                       if submit then ContributionStatus.Submitted
                       else if contribution.status == ContributionStatus.Declined then ContributionStatus.Draft
                       else contribution.status
                     locationName = validLocation.fold(contribution.locationName)(_.name)
                     latitude = validLocation.fold(contribution.latitude)(_.latitude)
                     longitude = validLocation.fold(contribution.longitude)(_.longitude)
                     locationSource =
                       if validLocation.isDefined then ContributionLocations.contributorSource else contribution.locationSource
                     locationChanged = validLocation.exists(input =>
                                        input.name != contribution.locationName ||
                                          input.latitude != contribution.latitude ||
                                          input.longitude != contribution.longitude
                                      )
                     removePhotoNow = removePhoto && ContributionViews.hasPhoto(contribution)
                     captionChanged = validCaption != contribution.suggestedCaption
                     contentChanged =
                       validMemory != contribution.memoryText || captionChanged || locationChanged || removePhotoNow
                     newVersion = if contentChanged then contribution.version + 1 else contribution.version
                     _ <-
                       if removePhotoNow then
                         ContributionTable
                           .clearPhoto(
                             connection,
                             contribution.id,
                             userId,
                             contribution.version,
                             newVersion,
                             targetStatus,
                             now
                           )
                           .flatMap(ensureUpdated)
                       else IO.unit
                     expectedVersion = if removePhotoNow then newVersion else contribution.version
                     _ <- ContributionTable
                            .updateContent(
                              connection,
                              contribution.id,
                              userId,
                              expectedVersion,
                              newVersion,
                              targetStatus,
                              validMemory,
                              validCaption,
                              locationName,
                              latitude,
                              longitude,
                              locationSource,
                              now
                            )
                            .flatMap(ensureUpdated)
                     _ <-
                       if removePhotoNow then
                         staleFiles.set(
                           List(contribution.originalKey, contribution.thumbKey, contribution.displayKey).flatten
                         )
                       else IO.unit
                     updated <- ContributionTable.findById(connection, contribution.id).flatMap {
                                  case Some(found) => IO.pure(found)
                                  case None => IO.raiseError(ApiException(ApiError.internal("投稿更新后不可见")))
                                }
                     summary <- ContributionLookups.summary(connection, updated)
                   yield summary
                 }
      _ <- staleFiles.get.flatMap(keys => PhotoStorage.delete(dataDirectory, keys)).attempt.void
    yield summary

  private def ensureUpdated(rows: Int): IO[Unit] =
    IO.raiseWhen(rows == 0)(
      ApiException(ApiError.conflict(ConflictReason.ContributionVersionConflict, "投稿已变化，请刷新后重试"))
    )

  /** submit=true 要求 1–1000 码点；保存草稿允许空文字但不超过上限。 */
  private def requireMemory(rawMemory: String, submit: Boolean): IO[String] =
    val memory = rawMemory.trim
    val codePoints = memory.codePointCount(0, memory.length)
    val minimum = if submit then 1 else 0
    if codePoints >= minimum && codePoints <= ContributionLimits.MaxMemoryCodePoints then IO.pure(memory)
    else
      IO.raiseError(
        ApiException(
          ApiError.validation(
            ValidationReason.ContributionMemoryInvalid,
            if submit then s"回忆需为 1–${ContributionLimits.MaxMemoryCodePoints} 个字符"
            else s"回忆最多 ${ContributionLimits.MaxMemoryCodePoints} 个字符"
          )
        )
      )

object UpdateContributionMessage:
  private val photoRequired: ApiException =
    ApiException(
      ApiError.validation(ValidationReason.ContributionPhotoRequired, "提交需要已有照片；提交后不能移除照片，移除照片仅草稿可做")
    )
