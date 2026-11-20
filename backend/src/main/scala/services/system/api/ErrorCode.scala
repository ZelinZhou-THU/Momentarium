package services.system.api

/** 契约中固定的错误码，HTTP 状态映射见 httpStatus。 */
enum ErrorCode:
  case BadRequest
  case Validation
  case Unauthorized
  case Forbidden
  case NotFound
  case Conflict
  case ModelFailure
  case GenerationFailed
  case UpstreamUnavailable
  case Internal

object ErrorCode:
  def toString(code: ErrorCode): String =
    code match
      case ErrorCode.BadRequest => "BAD_REQUEST"
      case ErrorCode.Validation => "VALIDATION"
      case ErrorCode.Unauthorized => "UNAUTHORIZED"
      case ErrorCode.Forbidden => "FORBIDDEN"
      case ErrorCode.NotFound => "NOT_FOUND"
      case ErrorCode.Conflict => "CONFLICT"
      case ErrorCode.ModelFailure => "MODEL_FAILURE"
      case ErrorCode.GenerationFailed => "GENERATION_FAILED"
      case ErrorCode.UpstreamUnavailable => "UPSTREAM_UNAVAILABLE"
      case ErrorCode.Internal => "INTERNAL"

  def httpStatus(code: ErrorCode): Int =
    code match
      case ErrorCode.BadRequest => 400
      case ErrorCode.Validation => 400
      case ErrorCode.Unauthorized => 401
      case ErrorCode.Forbidden => 403
      case ErrorCode.NotFound => 404
      case ErrorCode.Conflict => 409
      case ErrorCode.ModelFailure => 502
      case ErrorCode.GenerationFailed => 500
      case ErrorCode.UpstreamUnavailable => 503
      case ErrorCode.Internal => 500
