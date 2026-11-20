package services.system.api

import java.sql.Connection

import cats.effect.IO

/** API 消息的统一执行入口：业务输入由构造参数承载，执行时传入连接。 */
trait APIMessage[Response]:
  def plan(connection: Connection): IO[Response]
