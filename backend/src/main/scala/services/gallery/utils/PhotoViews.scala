package services.gallery.utils

import services.gallery.objects.ExhibitionPhoto
import services.gallery.objects.apiTypes.{PhotoMemoryView, PhotoView}

/** 照片行到前端视图的映射：内容地址由 photoId 生成，前端按当前 origin 拼接；memories 来自已采用讲述。 */
private[gallery] object PhotoViews:
  def toView(photo: ExhibitionPhoto): PhotoView = toView(photo, Nil)

  def toView(photo: ExhibitionPhoto, memories: List[PhotoMemoryView]): PhotoView =
    PhotoView(
      id = photo.id,
      originalName = photo.originalName,
      mime = photo.mime,
      width = photo.width.getOrElse(0),
      height = photo.height.getOrElse(0),
      caption = photo.caption,
      groupId = photo.groupId,
      positionInGroup = photo.positionInGroup,
      contentUrl = s"/api/photos/${photo.id.value}/content?variant=full",
      thumbUrl = s"/api/photos/${photo.id.value}/content?variant=thumb",
      memories = memories
    )
