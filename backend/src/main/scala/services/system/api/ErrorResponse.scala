package services.system.api

import io.circe.Encoder
import io.circe.generic.semiauto.deriveEncoder

/** 失败响应的统一外壳。 */
final case class ErrorResponse(error: ApiError)

object ErrorResponse:
  given Encoder[ErrorResponse] = deriveEncoder[ErrorResponse]
