package services.gallery.utils

import services.gallery.objects.{ContributionId, ExhibitionId, PhotoFormat}

/** 投稿文件的专用键空间：`contributions/{exhibitionId}/{contributionId}/v{version}.*`。
  * 与草稿/快照文件完全独立；采用时由消息把源文件复制成草稿照片的独立文件。 */
private[gallery] object ContributionStorage:
  def originalKey(exhibitionId: ExhibitionId, contributionId: ContributionId, version: Int, format: PhotoFormat): String =
    s"contributions/${exhibitionId.value}/${contributionId.value}/v$version.${format.fileExtension}"

  def thumbnailKey(exhibitionId: ExhibitionId, contributionId: ContributionId, version: Int): String =
    s"contributions/${exhibitionId.value}/${contributionId.value}/v$version.thumb.jpg"

  def displayKey(exhibitionId: ExhibitionId, contributionId: ContributionId, version: Int): String =
    s"contributions/${exhibitionId.value}/${contributionId.value}/v$version.display.jpg"

  /** 清理某一版本的文件（替换/重新上传成功后删除旧版本）。 */
  def versionKeys(exhibitionId: ExhibitionId, contributionId: ContributionId, version: Int): List[String] =
    List(
      originalKey(exhibitionId, contributionId, version, PhotoFormat.Jpeg),
      originalKey(exhibitionId, contributionId, version, PhotoFormat.Png),
      originalKey(exhibitionId, contributionId, version, PhotoFormat.Webp),
      thumbnailKey(exhibitionId, contributionId, version),
      displayKey(exhibitionId, contributionId, version)
    )
