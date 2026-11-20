package services.gallery.utils

import cats.effect.IO
import cats.syntax.all.*

import services.gallery.objects.*
import services.gallery.objects.apiTypes.{PhotoLocationView, PublicPhotoLocation}
import services.system.api.{ApiError, ApiException, ValidationReason}

/** 位置输入校验、视图装配与公开投影（纯函数；副作用由 API 消息组合）。 */
private[gallery] object PhotoLocations:
  val MaxNameCodePoints: Int = 120
  val MaxQueryCodePoints: Int = 200

  /** 作者确认写入的校验结果。 */
  final case class LocationInput(
    name: String,
    latitude: Option[Double],
    longitude: Option[Double],
    granularity: LocationGranularity
  )

  /** 校验 setphotolocation 输入：名称非空 ≤120 码点；坐标成对、有限、在 WGS84 范围内；粒度与坐标组合合法。 */
  def requireInput(
    name: String,
    latitude: Option[Double],
    longitude: Option[Double],
    rawGranularity: String
  ): IO[LocationInput] =
    val trimmedName = name.trim
    for
      _ <- IO.raiseWhen(codePointCount(trimmedName) < 1 || codePointCount(trimmedName) > MaxNameCodePoints)(nameInvalid)
      granularity <- LocationGranularity.fromString(rawGranularity) match
                       case Right(value) => IO.pure(value)
                       case Left(_) => IO.raiseError(granularityInvalid)
      coordinates <- validateCoordinates(latitude, longitude)
      _ <- IO.raiseWhen(granularity != LocationGranularity.Hidden && coordinates.isEmpty)(granularityInvalid)
    yield LocationInput(trimmedName, coordinates.map(_._1), coordinates.map(_._2), granularity)

  /** 校验 searchplaces query：去首尾空白后 1–200 码点。 */
  def requireQuery(rawQuery: String): IO[String] =
    val query = rawQuery.trim
    val count = codePointCount(query)
    if count >= 1 && count <= MaxQueryCodePoints then IO.pure(query)
    else IO.raiseError(ApiException(ApiError.validation(ValidationReason.PlaceQueryInvalid, "地点搜索词需为 1–200 个字符")))

  def view(location: PhotoLocation): PhotoLocationView =
    PhotoLocationView(
      photoId = location.photoId,
      source = location.source,
      status = location.status,
      name = location.name,
      latitude = location.latitude,
      longitude = location.longitude,
      granularity = location.granularity
    )

  /** 作者详情/发布视图的位置数组按照片展示顺序输出，跳过无记录照片。 */
  def views(photosInDisplayOrder: List[ExhibitionPhoto], locations: List[PhotoLocation]): List[PhotoLocationView] =
    val byPhotoId = locations.map(location => location.photoId -> location).toMap
    photosInDisplayOrder.flatMap(photo => byPhotoId.get(photo.id)).map(view)

  /** 发布时冻结公开位置：只含 confirmed 且 granularity != hidden 的位置，按照片顺序。 */
  def snapshotLocations(
    orderedPhotos: List[ExhibitionPhoto],
    locations: List[PhotoLocation]
  ): List[SnapshotLocation] =
    val byPhotoId = locations.map(location => location.photoId -> location).toMap
    orderedPhotos.flatMap(photo => byPhotoId.get(photo.id).flatMap(snapshotLocationOf))

  /** 公开视图：按快照 photos 顺序输出；旧快照没有 locations 字段时为空数组。 */
  def publicLocations(snapshot: PublicationSnapshot): List[PublicPhotoLocation] =
    val byPhotoId = snapshot.locations.getOrElse(Nil).map(location => location.photoId -> location).toMap
    snapshot.photos.flatMap(photo => byPhotoId.get(photo.id)).map(publicView)

  /** hasUnpublishedChanges 的“当前公开投影”：只比较快照所含照片中 confirmed 且公开的位置。 */
  def projection(snapshotPhotos: List[SnapshotPhoto], locations: List[PhotoLocation]): List[SnapshotLocation] =
    val byPhotoId = locations.map(location => location.photoId -> location).toMap
    snapshotPhotos.flatMap(photo => byPhotoId.get(photo.id).flatMap(snapshotLocationOf))

  private def publicView(location: SnapshotLocation): PublicPhotoLocation =
    PublicPhotoLocation(
      photoId = location.photoId,
      name = location.name,
      granularity = location.granularity,
      latitude = location.latitude,
      longitude = location.longitude
    )

  private def snapshotLocationOf(location: PhotoLocation): Option[SnapshotLocation] =
    if location.status != LocationStatus.Confirmed || !LocationGranularity.isPublic(location.granularity) then None
    else
      for
        latitude <- location.latitude
        longitude <- location.longitude
      yield SnapshotLocation(location.photoId, location.name, latitude, longitude, location.granularity)

  private def validateCoordinates(
    latitude: Option[Double],
    longitude: Option[Double]
  ): IO[Option[(Double, Double)]] =
    (latitude, longitude) match
      case (None, None) => IO.pure(None)
      case (Some(lat), Some(lon)) if isValidCoordinate(lat, lon) => IO.pure(Some((lat, lon)))
      case _ => IO.raiseError(coordinatesInvalid)

  private def isValidCoordinate(latitude: Double, longitude: Double): Boolean =
    latitude.isFinite && longitude.isFinite &&
      latitude >= -90.0 && latitude <= 90.0 &&
      longitude >= -180.0 && longitude <= 180.0

  private def codePointCount(value: String): Int =
    value.codePointCount(0, value.length)

  private def nameInvalid: ApiException =
    ApiException(ApiError.validation(ValidationReason.LocationNameInvalid, "地点名称需为 1–120 个字符"))

  private def coordinatesInvalid: ApiException =
    ApiException(
      ApiError.validation(
        ValidationReason.LocationCoordinatesInvalid,
        "坐标必须成对、有限且在 WGS84 范围内；area/exact 必须提供坐标"
      )
    )

  private def granularityInvalid: ApiException =
    ApiException(
      ApiError.validation(ValidationReason.LocationGranularityInvalid, "公开粒度必须是 hidden、area 或 exact")
    )
