package services.curation

import java.util.UUID

import munit.FunSuite

import services.curation.objects.apiTypes.{CurationProposal, ProposalGroup, ThemeProposal}
import services.curation.utils.CurationValidator
import services.gallery.objects.PhotoId
import services.gallery.objects.apiTypes.{ExhibitionPhotoInput, GroupInput}

/** 主题/修订提案的业务校验（spec 10.2 / 10.3）：覆盖完整、不重复、不使用未知 photoId。 */
class CurationValidatorSpec extends FunSuite:

  private val photoA = PhotoId(UUID.fromString("00000000-0000-0000-0000-00000000000a"))
  private val photoB = PhotoId(UUID.fromString("00000000-0000-0000-0000-00000000000b"))
  private val photoC = PhotoId(UUID.fromString("00000000-0000-0000-0000-00000000000c"))
  private val unknownPhoto = PhotoId(UUID.fromString("00000000-0000-0000-0000-0000000000ff"))
  private val allPhotoIds = Set(photoA, photoB, photoC)

  private def themeProposal(name: String, groups: List[ProposalGroup]): ThemeProposal =
    ThemeProposal(name, "把海边的记忆排成一段缓慢的故事。", groups)

  test("覆盖完整且无重复的 2 个方案通过校验") {
    val proposals = List(
      themeProposal("潮汐", List(ProposalGroup("海", List(photoA, photoB)), ProposalGroup("山", List(photoC)))),
      themeProposal("另一种光", List(ProposalGroup("全部", List(photoA, photoB, photoC))))
    )
    assertEquals(CurationValidator.validateThemeSuggestions(proposals, allPhotoIds), Right(()))
  }

  test("未覆盖全部照片被拒绝") {
    val proposals = List(
      themeProposal("潮汐", List(ProposalGroup("海", List(photoA, photoB)))),
      themeProposal("另一种光", List(ProposalGroup("全部", List(photoA, photoB))))
    )
    val result = CurationValidator.validateThemeSuggestions(proposals, allPhotoIds)
    assert(result.isLeft, s"应拒绝缺照片的方案，实际：$result")
  }

  test("照片重复出现被拒绝") {
    val proposals = List(
      themeProposal("潮汐", List(ProposalGroup("海", List(photoA, photoA, photoB, photoC)))),
      themeProposal("另一种光", List(ProposalGroup("全部", List(photoA, photoB, photoC))))
    )
    val result = CurationValidator.validateThemeSuggestions(proposals, allPhotoIds)
    assert(result.isLeft, s"应拒绝重复照片的方案，实际：$result")
  }

  test("使用不属于该展览的 photoId 被拒绝") {
    val proposals = List(
      themeProposal("潮汐", List(ProposalGroup("海", List(photoA, photoB, photoC, unknownPhoto)))),
      themeProposal("另一种光", List(ProposalGroup("全部", List(photoA, photoB, photoC))))
    )
    val result = CurationValidator.validateThemeSuggestions(proposals, allPhotoIds)
    assert(result.isLeft, s"应拒绝未知 photoId 的方案，实际：$result")
    assert(result.left.exists(_.exists(_.contains("不属于该展览"))), s"错误信息应指出未知照片：$result")
  }

  test("方案数量不在 2–3 之间被拒绝") {
    val single = List(themeProposal("潮汐", List(ProposalGroup("全部", List(photoA, photoB, photoC)))))
    val result = CurationValidator.validateThemeSuggestions(single, allPhotoIds)
    assert(result.isLeft, s"应拒绝只有 1 个方案的输出，实际：$result")
  }

  test("name 超过 24 字或 concept 超过 120 字被拒绝") {
    val longName = ThemeProposal("很" * 25, "理念", List(ProposalGroup("全部", List(photoA, photoB, photoC))))
    val other = themeProposal("另一种光", List(ProposalGroup("全部", List(photoA, photoB, photoC))))
    assert(CurationValidator.validateThemeSuggestions(List(longName, other), allPhotoIds).isLeft, "长 name 应被拒绝")

    val longConcept = ThemeProposal("潮汐", "念" * 121, List(ProposalGroup("全部", List(photoA, photoB, photoC))))
    assert(CurationValidator.validateThemeSuggestions(List(longConcept, other), allPhotoIds).isLeft, "长 concept 应被拒绝")
  }

  test("refine：使用不属于展览的 photoId 被拒绝") {
    val proposal = CurationProposal(
      "济州的三天",
      "从海边到山里。",
      List(GroupInput("海", "", List(ExhibitionPhotoInput(photoA, "caption"), ExhibitionPhotoInput(unknownPhoto, "x"))))
    )
    val result = CurationValidator.validateRefine("已调整。", proposal, allPhotoIds)
    assert(result.isLeft, s"应拒绝未知 photoId 的修订提案，实际：$result")
  }

  test("refine：空分组、重复照片与超长 reply 被拒绝") {
    val emptyGroup = CurationProposal("济州的三天", "", List(GroupInput("空组", "", Nil)))
    assert(CurationValidator.validateRefine("已调整。", emptyGroup, allPhotoIds).isLeft, "空分组应被拒绝")

    val duplicate = CurationProposal(
      "济州的三天",
      "",
      List(GroupInput("海", "", List(ExhibitionPhotoInput(photoA, ""), ExhibitionPhotoInput(photoA, ""))))
    )
    assert(CurationValidator.validateRefine("已调整。", duplicate, allPhotoIds).isLeft, "重复照片应被拒绝")

    val validProposal = CurationProposal(
      "济州的三天",
      "",
      List(GroupInput("海", "", List(ExhibitionPhotoInput(photoA, ""))))
    )
    assert(CurationValidator.validateRefine("字" * 201, validProposal, allPhotoIds).isLeft, "超长 reply 应被拒绝")
  }

  test("refine：合法的回复与提案通过校验") {
    val proposal = CurationProposal(
      "济州的三天",
      "从海边到山里。",
      List(
        GroupInput("海边的黄昏", "", List(ExhibitionPhotoInput(photoA, "日落时的礁石"), ExhibitionPhotoInput(photoB, ""))),
        GroupInput("山里", "", List(ExhibitionPhotoInput(photoC, "")))
      )
    )
    assertEquals(CurationValidator.validateRefine("已把海边两张放到最前面，图注改短了。", proposal, allPhotoIds), Right(()))
  }
