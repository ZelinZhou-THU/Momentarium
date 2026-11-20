package services.system.api

import services.users.objects.UserId

/** 需要令牌的消息：路由器完成令牌解析后，以可信 userId 构造实例。 */
trait APIWithTokenMessage[Response] extends APIMessage[Response]:
  def userId: UserId
