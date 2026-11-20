package services.scene.utils

import services.scene.objects.SceneReview

/**
 * 一次主观验收的裁决（spec §9.5/§9.6）：
 * - Passed：进入 Succeeded(source=Ai)；
 * - Revise：attempts+1 回 Generating，并用 issues 重新生成；
 * - RepairBuild：代码在构建阶段崩溃，用独立的构建修复额度（buildRepairs+1）重新生成，不占修订额度；
 * - Fallback：修订次数用尽，改用兜底工件（review 能保留则保留）。
 */
private[scene] enum ReviewOutcome:
  case Passed(review: SceneReview)
  case Revise(review: SceneReview, issues: List[String])
  case RepairBuild(review: SceneReview, issues: List[String])
  case Fallback(review: Option[SceneReview])
