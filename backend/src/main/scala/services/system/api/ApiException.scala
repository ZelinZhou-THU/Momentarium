package services.system.api

/** 业务错误的 IO 错误通道载体：路由器边界统一序列化为 {"error": {...}}。 */
final case class ApiException(error: ApiError) extends RuntimeException(error.message)
