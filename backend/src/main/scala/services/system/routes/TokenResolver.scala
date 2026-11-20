package services.system.routes

import java.sql.Connection

import cats.effect.IO

import services.users.objects.UserId

/** 路由器令牌解析钩子：把外部令牌换成可信 userId，实现方调用 users 服务的内部消息。 */
final case class TokenResolver(resolve: (Connection, String) => IO[UserId])
