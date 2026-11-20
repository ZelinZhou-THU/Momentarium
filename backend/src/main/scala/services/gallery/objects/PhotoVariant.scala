package services.gallery.objects

import java.util.Locale

/** 照片内容路由的两种变体：缩略图与原图。 */
enum PhotoVariant:
  case Thumb
  case Full

object PhotoVariant:
  def fromString(value: String): Either[String, PhotoVariant] =
    value.trim.toLowerCase(Locale.ROOT) match
      case "thumb" => Right(PhotoVariant.Thumb)
      case "full" => Right(PhotoVariant.Full)
      case other => Left(s"Unsupported PhotoVariant value: $other")
