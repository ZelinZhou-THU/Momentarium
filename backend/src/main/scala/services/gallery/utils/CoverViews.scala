package services.gallery.utils

import services.gallery.objects.{CoverKind, Exhibition, ExhibitionGroup, ExhibitionId, ExhibitionPhoto}
import services.gallery.objects.apiTypes.CoverView

/** 封面解析：auto 取第一章第一张照片，photo 取选定照片，render 使用已上传的渲染封面。 */
private[gallery] object CoverViews:
  def coverOf(exhibition: Exhibition, groups: List[ExhibitionGroup], photos: List[ExhibitionPhoto]): CoverView =
    exhibition.coverKind match
      case CoverKind.Render =>
        CoverView(
          kind = CoverKind.Render,
          imageUrl = coverImageUrl(exhibition.id),
          width = exhibition.coverWidth.getOrElse(0),
          height = exhibition.coverHeight.getOrElse(0)
        )
      case kind =>
        resolvedPhoto(exhibition, groups, photos) match
          case Some(photo) => photoCover(exhibition.id, kind, photo)
          case None => CoverView(kind, coverImageUrl(exhibition.id), 0, 0)

  /** 封面字节路由需要解析出的照片行；auto/photo 均落到同一张照片。 */
  def resolvedPhoto(
    exhibition: Exhibition,
    groups: List[ExhibitionGroup],
    photos: List[ExhibitionPhoto]
  ): Option[ExhibitionPhoto] =
    exhibition.coverKind match
      case CoverKind.Auto => firstPhoto(groups, photos)
      case CoverKind.Photo =>
        exhibition.coverPhotoId.flatMap(id => photos.find(_.id == id)).orElse(firstPhoto(groups, photos))
      case CoverKind.Render => None

  def autoCover(exhibitionId: ExhibitionId, groups: List[ExhibitionGroup], photos: List[ExhibitionPhoto]): CoverView =
    firstPhoto(groups, photos) match
      case Some(photo) => photoCover(exhibitionId, CoverKind.Auto, photo)
      case None => CoverView(CoverKind.Auto, coverImageUrl(exhibitionId), 0, 0)

  def photoCover(exhibitionId: ExhibitionId, kind: CoverKind, photo: ExhibitionPhoto): CoverView =
    CoverView(
      kind = kind,
      imageUrl = coverImageUrl(exhibitionId),
      width = photo.width.getOrElse(0),
      height = photo.height.getOrElse(0)
    )

  def renderCover(exhibitionId: ExhibitionId, width: Int, height: Int): CoverView =
    CoverView(kind = CoverKind.Render, imageUrl = coverImageUrl(exhibitionId), width = width, height = height)

  private def coverImageUrl(exhibitionId: ExhibitionId): String =
    s"/api/exhibitions/${exhibitionId.value}/cover"

  private def firstPhoto(groups: List[ExhibitionGroup], photos: List[ExhibitionPhoto]): Option[ExhibitionPhoto] =
    val firstPhotoOfEachGroup = groups
      .sortBy(_.position)
      .flatMap(group =>
        photos
          .filter(photo => photo.groupId.contains(group.id) && photo.archivedAt.isEmpty)
          .sortBy(_.positionInGroup.getOrElse(Int.MaxValue))
          .headOption
      )
    firstPhotoOfEachGroup.headOption.orElse(photos.find(_.archivedAt.isEmpty))
