package services.gallery.objects

/** 投稿契约中可复用的长度限制；API 消息与校验共用，避免 create/update 各自维护。 */
object ContributionLimits:
  /** 一段回忆的最大 Unicode 码点数（创建与更新同口径）。 */
  val MaxMemoryCodePoints: Int = 1000
