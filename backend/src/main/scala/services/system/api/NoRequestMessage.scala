package services.system.api

/** 无业务请求输入的消息：请求体固定为 {}，路由器不解析请求内容。 */
trait NoRequestMessage[Response] extends APIMessage[Response]
