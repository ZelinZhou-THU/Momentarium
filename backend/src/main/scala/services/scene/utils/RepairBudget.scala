package services.scene.utils

/**
 * 一次运行剩余的重新生成额度：质量修订（attempts / maxRevisions）与构建修复（buildRepairs / maxBuildRepairs）分开计。
 * 构建阶段崩溃多是重复声明、写错 API 这类低级错误，修一次通常就能渲染；不让它占掉质量修订的机会。
 */
private[scene] final case class RepairBudget(
  attempts: Int,
  maxRevisions: Int,
  buildRepairs: Int,
  maxBuildRepairs: Int
):
  def revisionsLeft: Boolean = attempts < maxRevisions
  def buildRepairsLeft: Boolean = buildRepairs < maxBuildRepairs
