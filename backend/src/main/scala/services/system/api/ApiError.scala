package services.system.api

import io.circe.{Encoder, Json, JsonObject}

/** 契约中的错误对象：code 决定 HTTP 状态，details.reason 为稳定原因码。 */
final case class ApiError(code: ErrorCode, message: String, details: Option[JsonObject])

object ApiError:
  private def withReason(code: ErrorCode, message: String, reason: String): ApiError =
    ApiError(code, message, Some(JsonObject("reason" -> Json.fromString(reason))))

  def badRequest(message: String): ApiError = ApiError(ErrorCode.BadRequest, message, None)

  def validation(reason: ValidationReason, message: String): ApiError =
    withReason(ErrorCode.Validation, message, ValidationReason.toString(reason))

  def unauthorized(message: String): ApiError = ApiError(ErrorCode.Unauthorized, message, None)

  def forbidden(message: String): ApiError = ApiError(ErrorCode.Forbidden, message, None)

  def notFound(message: String): ApiError = ApiError(ErrorCode.NotFound, message, None)

  def conflict(reason: ConflictReason, message: String): ApiError =
    withReason(ErrorCode.Conflict, message, ConflictReason.toString(reason))

  def modelFailure(message: String): ApiError = ApiError(ErrorCode.ModelFailure, message, None)

  def generationFailed(message: String): ApiError = ApiError(ErrorCode.GenerationFailed, message, None)

  /** 外部依赖不可用（如地点搜索提供方超时/拒绝），details.reason 为稳定原因码。 */
  def upstreamUnavailable(reason: UpstreamReason, message: String): ApiError =
    withReason(ErrorCode.UpstreamUnavailable, message, UpstreamReason.toString(reason))

  def internal(message: String): ApiError = ApiError(ErrorCode.Internal, message, None)

  given Encoder[ApiError] = Encoder.instance { error =>
    Json.obj(
      "code" -> Json.fromString(ErrorCode.toString(error.code)),
      "message" -> Json.fromString(error.message),
      "details" -> error.details.fold(Json.Null)(Json.fromJsonObject)
    )
  }
