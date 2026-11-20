package services.curation.utils

import services.curation.objects.apiTypes.{CurationProposal, ThemeProposal}
import services.gallery.objects.PhotoId

/**
 * 模型输出的业务校验（spec 10.2 / 10.3）。纯函数，返回可回灌给模型修复的错误列表；
 * 与 AI 适配层的“类型化解码”分离：这里只判断业务规则。
 */
private[curation] object CurationValidator:

  val MaxHintLength = 200
  val MaxInstructionLength = 500
  val MaxReplyLength = 200
  val MinThemeProposals = 2
  val MaxThemeProposals = 3
  val MaxThemeNameLength = 24
  val MaxThemeConceptLength = 120
  val MaxGroupCount = 4

  def validateHint(hint: Option[String]): Either[String, Unit] =
    hint match
      case Some(text) if text.length > MaxHintLength => Left(s"hint 不能超过 $MaxHintLength 字")
      case _ => Right(())

  def validateInstruction(instruction: String): Either[String, Unit] =
    if instruction.trim.isEmpty then Left("instruction 不能为空")
    else if instruction.length > MaxInstructionLength then Left(s"instruction 不能超过 $MaxInstructionLength 字")
    else Right(())

  /** 主题方案：2–3 个、名称/理念字数、分组 1–4、覆盖全部照片且不重复、不使用未知 photoId。 */
  def validateThemeSuggestions(
    proposals: List[ThemeProposal],
    exhibitionPhotoIds: Set[PhotoId]
  ): Either[List[String], Unit] =
    val countErrors =
      Option
        .when(proposals.size < MinThemeProposals || proposals.size > MaxThemeProposals)(
          s"必须输出 $MinThemeProposals–$MaxThemeProposals 个主题方案，实际 ${proposals.size} 个"
        )
        .toList
    val proposalErrors = proposals.zipWithIndex.flatMap { case (proposal, index) =>
      validateThemeProposal(proposal, exhibitionPhotoIds, index + 1)
    }
    (countErrors ++ proposalErrors) match
      case Nil => Right(())
      case errors => Left(errors)

  /** 修订提案：reply 字数、必须有标题、分组非空且每组照片非空、只使用该展览现有 photoId、不重复。 */
  def validateRefine(
    reply: String,
    proposal: CurationProposal,
    exhibitionPhotoIds: Set[PhotoId]
  ): Either[List[String], Unit] =
    val replyErrors =
      Option.when(reply.trim.isEmpty)("reply 不能为空").toList ++
        Option.when(reply.length > MaxReplyLength)(s"reply 不能超过 $MaxReplyLength 字").toList
    val titleErrors =
      Option.when(proposal.title.trim.isEmpty)("proposal.title 不能为空").toList
    val groupCountErrors =
      Option.when(proposal.groups.isEmpty || proposal.groups.size > MaxGroupCount)(
        s"proposal 的分组数必须是 1–$MaxGroupCount"
      ).toList
    val groupErrors = proposal.groups.zipWithIndex.flatMap { case (group, index) =>
      Option.when(group.title.trim.isEmpty)(s"proposal 第 ${index + 1} 组标题为空").toList ++
        Option.when(group.photos.isEmpty)(s"proposal 第 ${index + 1} 组没有照片").toList
    }
    val repeatedPhotoIds = proposal.groups.flatMap(_.photos.map(_.photoId))
    val unknown = repeatedPhotoIds.toSet -- exhibitionPhotoIds
    val duplicates = repeatedPhotoIds.groupBy(identity).collect { case (id, occurrences) if occurrences.size > 1 => id }.toList
    val photoIdErrors =
      Option.when(unknown.nonEmpty)(s"proposal 使用了不属于该展览的照片：${unknown.map(_.value).mkString(", ")}").toList ++
        Option.when(duplicates.nonEmpty)(s"proposal 照片重复出现：${duplicates.map(_.value).mkString(", ")}").toList
    (replyErrors ++ titleErrors ++ groupCountErrors ++ groupErrors ++ photoIdErrors) match
      case Nil => Right(())
      case errors => Left(errors)

  private def validateThemeProposal(
    proposal: ThemeProposal,
    exhibitionPhotoIds: Set[PhotoId],
    index: Int
  ): List[String] =
    val prefix = s"方案$index"
    val fieldErrors =
      Option.when(proposal.name.trim.isEmpty)(s"$prefix 的 name 不能为空").toList ++
        Option.when(proposal.name.length > MaxThemeNameLength)(s"$prefix 的 name 不能超过 $MaxThemeNameLength 字").toList ++
        Option.when(proposal.concept.trim.isEmpty)(s"$prefix 的 concept 不能为空").toList ++
        Option.when(proposal.concept.length > MaxThemeConceptLength)(
          s"$prefix 的 concept 不能超过 $MaxThemeConceptLength 字"
        ).toList ++
        Option.when(proposal.groups.isEmpty || proposal.groups.size > MaxGroupCount)(
          s"$prefix 的分组数必须是 1–$MaxGroupCount"
        ).toList
    val groupTitleErrors = proposal.groups.zipWithIndex.flatMap { case (group, groupIndex) =>
      Option.when(group.title.trim.isEmpty)(s"$prefix 第 ${groupIndex + 1} 组标题为空").toList
    }
    val photoIds = proposal.groups.flatMap(_.photoIds)
    val unknown = photoIds.toSet -- exhibitionPhotoIds
    val duplicates = photoIds.groupBy(identity).collect { case (id, occurrences) if occurrences.size > 1 => id }.toList
    val missing = exhibitionPhotoIds -- photoIds.toSet
    fieldErrors ++ groupTitleErrors ++
      Option.when(unknown.nonEmpty)(s"$prefix 使用了不属于该展览的照片：${unknown.map(_.value).mkString(", ")}").toList ++
      Option.when(duplicates.nonEmpty)(s"$prefix 照片重复出现：${duplicates.map(_.value).mkString(", ")}").toList ++
      Option.when(missing.nonEmpty)(s"$prefix 未覆盖的照片：${missing.map(_.value).mkString(", ")}").toList
