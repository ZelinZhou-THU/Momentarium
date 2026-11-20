package services.gallery.utils

import cats.effect.IO

import services.system.api.{ApiError, ApiException, ValidationReason}

/** 展览标题校验：空标题是契约中的稳定 reason TITLE_REQUIRED。 */
private[gallery] object ExhibitionValidation:
  def requireTitle(rawTitle: String): IO[String] =
    val candidate = rawTitle.trim
    if candidate.nonEmpty then IO.pure(candidate)
    else IO.raiseError(ApiException(ApiError.validation(ValidationReason.TitleRequired, "展览标题不能为空")))
