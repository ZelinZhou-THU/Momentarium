package services.gallery.utils

import services.gallery.objects.*
import services.gallery.objects.apiTypes.*
import services.users.objects.{Profile, User}

/** 共同投稿的 DTO 装配：投稿摘要、邀请/参与、讲述视图；不读数据库、不做权限判定。 */
private[gallery] object ContributionViews:
  def displayName(user: User, profile: Option[Profile]): String =
    profile.map(_.displayName).map(_.trim).filter(_.nonEmpty).getOrElse(user.username)

  def contributorBrief(user: User, profile: Option[Profile]): ContributorBrief =
    ContributorBrief(user.id, user.username, displayName(user, profile))

  def inviteSummary(invite: ContributionInvite): ContributionInviteSummary =
    ContributionInviteSummary(
      id = invite.id,
      status = invite.status,
      createdAt = invite.createdAt,
      closedAt = invite.closedAt
    )

  def invitePreview(exhibitionTitle: String, inviterName: String, invite: ContributionInvite): ContributionInvitePreview =
    ContributionInvitePreview(exhibitionTitle, inviterName, invite.status)

  def membershipView(exhibitionTitle: String, contributor: ExhibitionContributor): ContributionMembershipView =
    ContributionMembershipView(
      exhibitionId = contributor.exhibitionId,
      exhibitionTitle = exhibitionTitle,
      status = contributor.status,
      joinedAt = contributor.joinedAt
    )

  def contributorView(
    user: User,
    profile: Option[Profile],
    contributor: ExhibitionContributor,
    contributionCount: Int
  ): ContributorView =
    ContributorView(
      contributorId = contributor.userId,
      username = user.username,
      displayName = displayName(user, profile),
      status = contributor.status,
      joinedAt = contributor.joinedAt,
      contributionCount = contributionCount
    )

  def locationView(contribution: Contribution): Option[ContributionLocationView] =
    val hasName = contribution.locationName.trim.nonEmpty
    if hasName || contribution.latitude.isDefined then
      Some(
        ContributionLocationView(
          name = contribution.locationName,
          latitude = contribution.latitude,
          longitude = contribution.longitude,
          source = contribution.locationSource
        )
      )
    else None

  def fileView(contribution: Contribution): Option[ContributionFileView] =
    contribution.mime.map { mime =>
      ContributionFileView(
        mime = mime,
        width = contribution.width,
        height = contribution.height,
        contentUrl = s"/api/contributions/${contribution.id.value}/content?variant=full",
        thumbUrl = s"/api/contributions/${contribution.id.value}/content?variant=thumb"
      )
    }

  /** 是否附有照片（阶段 2.5：照片可选）；纯文字投稿为 false。 */
  def hasPhoto(contribution: Contribution): Boolean =
    contribution.originalKey.isDefined

  def adoptionView(memory: PhotoMemory): ContributionAdoptionView =
    ContributionAdoptionView(memory.contributionId, memory.photoId, memory.id, memory.adoptedVersion)

  /** 已采用的讲述是否已经出现在当前发布快照里：快照中同一张照片带有同样正文与署名的讲述（v1.16）。
    * 采用发生在发布之后、或展览没有 active 发布，都视为未公开。 */
  def isMemoryPublished(memory: Option[PhotoMemory], publication: Option[Publication]): Boolean =
    memory.exists(adopted =>
      publication.exists(
        _.snapshot.photos.exists(photo =>
          photo.id == adopted.photoId &&
            photo.memories
              .getOrElse(Nil)
              .exists(frozen => frozen.text == adopted.text && frozen.contributorName == adopted.contributorName)
        )
      )
    )

  def summary(
    contribution: Contribution,
    exhibitionTitle: String,
    contributor: ContributorBrief,
    adoptedMemory: Option[PhotoMemory],
    publication: Option[Publication]
  ): ContributionSummary =
    val adoption = adoptedMemory.map(adoptionView)
    ContributionSummary(
      id = contribution.id,
      exhibitionId = contribution.exhibitionId,
      exhibitionTitle = exhibitionTitle,
      contributor = contributor,
      status = contribution.status,
      version = contribution.version,
      memoryText = contribution.memoryText,
      suggestedCaption = contribution.suggestedCaption,
      location = locationView(contribution),
      file = fileView(contribution),
      adoption = adoption,
      hasPendingUpdate = adoption.exists(view => contribution.version > view.adoptedVersion),
      exhibitionPublished = publication.isDefined,
      memoryPublished = isMemoryPublished(adoptedMemory, publication),
      createdAt = contribution.createdAt,
      updatedAt = contribution.updatedAt,
      withdrawnAt = contribution.withdrawnAt
    )

  def photoMemoryViews(memories: List[PhotoMemory]): List[PhotoMemoryView] =
    memories.map(memory => PhotoMemoryView(memory.id, memory.text, memory.contributorName))

  def memoriesByPhoto(memories: List[PhotoMemory]): Map[PhotoId, List[PhotoMemory]] =
    memories.groupBy(_.photoId)

  /** 发布冻结的讲述：顺序沿用 photo_memories 的采用顺序（created_at, id）。 */
  def snapshotMemories(memories: List[PhotoMemory]): List[SnapshotMemory] =
    memories.map(memory => SnapshotMemory(memory.text, memory.contributorName))

  def publicMemories(memories: Option[List[SnapshotMemory]]): List[PublicPhotoMemory] =
    memories.getOrElse(Nil).map(memory => PublicPhotoMemory(memory.text, memory.contributorName))
