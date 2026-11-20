package services.gallery.utils

import java.sql.Connection

import cats.effect.IO

import services.gallery.objects.ExhibitionId
import services.system.api.{ApiError, ApiException, ValidationReason}
import services.system.config.ContributionConfig
import services.system.db.AdvisoryLock

/** 投稿配额校验（纯判定）与展览级 advisory lock（串行化“检查配额 + 插入”，防并发超限）。 */
private[gallery] object ContributionQuota:

  /** 展览级事务锁：同一展览的配额检查与占位串行执行；必须在事务内调用。 */
  def acquireExhibitionLock(connection: Connection, exhibitionId: ExhibitionId): IO[Unit] =
    val key = exhibitionId.value.getMostSignificantBits ^ exhibitionId.value.getLeastSignificantBits
    AdvisoryLock.acquireTransactionLock(connection, key)

  def requireBatchSize(fileCount: Int, config: ContributionConfig): IO[Unit] =
    if fileCount >= 1 && fileCount <= config.maxBatchFiles then IO.unit
    else
      IO.raiseError(
        ApiException(
          ApiError.validation(
            ValidationReason.ContributionBatchLimit,
            s"单批最多 ${config.maxBatchFiles} 个文件，且至少 1 个"
          )
        )
      )

  /** 写文件前的人/展览张数配额；existing 为当前占用（含已撤回未清理的稿）。 */
  def requirePhotoQuota(
    existingForContributor: Int,
    existingForExhibition: Int,
    incoming: Int,
    config: ContributionConfig
  ): IO[Unit] =
    if existingForContributor + incoming > config.maxPhotosPerUser then
      IO.raiseError(
        ApiException(
          ApiError.validation(
            ValidationReason.ContributionQuotaPhotos,
            s"每人每展览最多 ${config.maxPhotosPerUser} 张投稿照片"
          )
        )
      )
    else if existingForExhibition + incoming > config.maxPhotosPerExhibition then
      IO.raiseError(
        ApiException(
          ApiError.validation(
            ValidationReason.ContributionQuotaPhotos,
            s"每个展览最多 ${config.maxPhotosPerExhibition} 张投稿照片"
          )
        )
      )
    else IO.unit

  /** 写文件前的字节配额（原图 + 衍生图；existing 含已撤回未清理的稿）。 */
  def requireBytesQuota(
    existingBytesForContributor: Long,
    existingBytesForExhibition: Long,
    incomingBytes: Long,
    config: ContributionConfig
  ): IO[Unit] =
    if existingBytesForContributor + incomingBytes > config.maxBytesPerUser then
      IO.raiseError(
        ApiException(
          ApiError.validation(
            ValidationReason.ContributionQuotaBytes,
            s"每人每展览投稿容量最多 ${config.maxBytesPerUser} 字节"
          )
        )
      )
    else if existingBytesForExhibition + incomingBytes > config.maxBytesPerExhibition then
      IO.raiseError(
        ApiException(
          ApiError.validation(
            ValidationReason.ContributionQuotaBytes,
            s"每个展览投稿容量最多 ${config.maxBytesPerExhibition} 字节"
          )
        )
      )
    else IO.unit
