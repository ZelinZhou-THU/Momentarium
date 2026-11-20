package services.gallery.utils

import cats.effect.IO

import services.system.api.{ApiError, ApiException, ValidationReason}

/** 投稿建议图注校验（api-contract v1.11）：trim 后 0–120 个 Unicode 码点，空串存 null；
  * 含控制字符（U+0000–U+001F 与 U+007F，含换行/制表符）一律 400 `CONTRIBUTION_CAPTION_INVALID`。
  * 允许中文、常规标点与 emoji（按码点计数）。 */
private[gallery] object ContributionCaptions:
  val MaxCaptionCodePoints: Int = 120

  /** 建议图注：trim 后空串存 null；非法返回 400。 */
  def normalize(raw: Option[String]): IO[Option[String]] =
    raw match
      case None => IO.pure(None)
      case Some(value) =>
        val caption = value.trim
        for
          _ <- validate(caption)
        yield Option.when(caption.nonEmpty)(caption)

  /** 采用新建照片时的显式图注：trim 后空串允许（= 清空预填值）；非空校验 0–120 码点与控制字符。 */
  def normalizePhotoCaption(raw: String): IO[String] =
    val caption = raw.trim
    validate(caption).as(caption)

  private def validate(caption: String): IO[Unit] =
    val codePoints = caption.codePointCount(0, caption.length)
    if codePoints > MaxCaptionCodePoints then IO.raiseError(invalid(s"图注最多 $MaxCaptionCodePoints 个字符"))
    else if hasForbiddenControl(caption) then IO.raiseError(invalid("图注不能包含控制字符"))
    else IO.unit

  private def hasForbiddenControl(value: String): Boolean =
    value.codePoints().anyMatch(codePoint => codePoint <= 0x1f || codePoint == 0x7f)

  private def invalid(message: String): ApiException =
    ApiException(ApiError.validation(ValidationReason.ContributionCaptionInvalid, message))
