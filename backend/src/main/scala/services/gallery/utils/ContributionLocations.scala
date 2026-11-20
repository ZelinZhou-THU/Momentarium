package services.gallery.utils

import cats.effect.IO

import services.gallery.objects.apiTypes.{ContributionLocationInput}
import services.gallery.objects.LocationSource
import services.system.api.{ApiError, ApiException, ValidationReason}

/** 投稿者位置输入校验：名称可为空（EXIF 建议），≤120 码点；坐标成对、有限、WGS84 范围内。 */
private[gallery] object ContributionLocations:
  val MaxNameCodePoints: Int = 120

  def normalize(input: ContributionLocationInput): IO[ContributionLocationInput] =
    val name = input.name.trim
    for
      _ <- IO.raiseWhen(codePointCount(name) > MaxNameCodePoints)(nameInvalid)
      _ <- validateCoordinates(input.latitude, input.longitude)
    yield ContributionLocationInput(name, input.latitude, input.longitude)

  /** 投稿者位置来源：阶段 2 只有 manual（EXIF 建议在阶段 1 上传链路，投稿上传不解析 EXIF）。 */
  val contributorSource: LocationSource = LocationSource.Manual

  private def validateCoordinates(latitude: Option[Double], longitude: Option[Double]): IO[Unit] =
    (latitude, longitude) match
      case (None, None) => IO.unit
      case (Some(lat), Some(lon)) if isValid(lat, lon) => IO.unit
      case _ => IO.raiseError(coordinatesInvalid)

  private def isValid(latitude: Double, longitude: Double): Boolean =
    latitude.isFinite && longitude.isFinite &&
      latitude >= -90.0 && latitude <= 90.0 &&
      longitude >= -180.0 && longitude <= 180.0

  private def codePointCount(value: String): Int = value.codePointCount(0, value.length)

  private val nameInvalid: ApiException =
    ApiException(ApiError.validation(ValidationReason.LocationNameInvalid, "地点名称最多 120 个字符"))

  private val coordinatesInvalid: ApiException =
    ApiException(
      ApiError.validation(
        ValidationReason.LocationCoordinatesInvalid,
        "坐标必须成对、有限且在 WGS84 范围内"
      )
    )
