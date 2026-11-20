package services.users.utils

import services.users.objects.{Profile, User}
import services.users.objects.apiTypes.ProfileView

/** 账户行 + 资料行 → 前端视图；没有资料行时使用默认值（显示名=用户名、简介空、主页关闭）。 */
private[users] object ProfileViews:
  def view(user: User, profile: Option[Profile]): ProfileView =
    ProfileView(
      username = user.username,
      displayName = profile.map(_.displayName).getOrElse(user.username),
      bio = profile.map(_.bio).getOrElse(""),
      homepagePublic = profile.exists(_.homepagePublic),
      createdAt = user.createdAt
    )
