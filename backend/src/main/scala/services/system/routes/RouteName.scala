package services.system.routes

import java.util.Locale

/** 路由名推导规则：消息类名去掉 Message 后转小写（RegisterMessage -> register）。 */
object RouteName:
  private val MessageSuffix = "Message"

  def fromMessageClassName(className: String): String =
    className.stripSuffix(MessageSuffix).toLowerCase(Locale.ROOT)

  def fromMessageClass(messageClass: Class[?]): String =
    fromMessageClassName(messageClass.getSimpleName)
