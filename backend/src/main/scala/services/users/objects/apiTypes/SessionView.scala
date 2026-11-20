package services.users.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.users.objects.UserId

/** 令牌解析结果：路由器据此构造携带可信 userId 的业务消息。 */
final case class SessionView(userId: UserId)

object SessionView:
  given Encoder[SessionView] = deriveEncoder[SessionView]
  given Decoder[SessionView] = deriveDecoder[SessionView]
