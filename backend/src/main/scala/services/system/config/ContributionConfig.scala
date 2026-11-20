package services.system.config

/** 共同投稿上传配额（spec §2.4 / §6.2）：默认值取期中计划建议值，可由 6 个 CONTRIBUTION_* 环境变量覆盖。 */
final case class ContributionConfig(
  maxFileBytes: Long,
  maxBatchFiles: Int,
  maxPhotosPerUser: Int,
  maxBytesPerUser: Long,
  maxPhotosPerExhibition: Int,
  maxBytesPerExhibition: Long
)

object ContributionConfig:
  private val Megabyte = 1024L * 1024L
  private val DefaultMaxFileMb = 15L
  private val DefaultMaxBatchFiles = 10
  private val DefaultMaxPhotosPerUser = 20
  private val DefaultMaxBytesPerUser = 256L * Megabyte
  private val DefaultMaxPhotosPerExhibition = 60
  private val DefaultMaxBytesPerExhibition = 768L * Megabyte

  def fromEnvironment(environment: Map[String, String]): Either[String, ContributionConfig] =
    for
      maxFileMb <- EnvironmentVariables.long(environment, "CONTRIBUTION_MAX_FILE_MB", DefaultMaxFileMb)
      maxBatchFiles <- EnvironmentVariables.int(environment, "CONTRIBUTION_MAX_BATCH", DefaultMaxBatchFiles)
      maxPhotosPerUser <- EnvironmentVariables.int(environment, "CONTRIBUTION_MAX_PHOTOS_PER_USER", DefaultMaxPhotosPerUser)
      maxBytesPerUser <- EnvironmentVariables.long(environment, "CONTRIBUTION_MAX_BYTES_PER_USER", DefaultMaxBytesPerUser)
      maxPhotosPerExhibition <-
        EnvironmentVariables.int(environment, "CONTRIBUTION_MAX_PHOTOS_PER_EXHIBITION", DefaultMaxPhotosPerExhibition)
      maxBytesPerExhibition <-
        EnvironmentVariables.long(environment, "CONTRIBUTION_MAX_BYTES_PER_EXHIBITION", DefaultMaxBytesPerExhibition)
      _ <- Either.cond(maxFileMb > 0, (), "CONTRIBUTION_MAX_FILE_MB 必须为正数")
      _ <- Either.cond(maxBatchFiles > 0, (), "CONTRIBUTION_MAX_BATCH 必须为正数")
      _ <- Either.cond(maxPhotosPerUser > 0, (), "CONTRIBUTION_MAX_PHOTOS_PER_USER 必须为正数")
      _ <- Either.cond(maxBytesPerUser > 0, (), "CONTRIBUTION_MAX_BYTES_PER_USER 必须为正数")
      _ <- Either.cond(maxPhotosPerExhibition > 0, (), "CONTRIBUTION_MAX_PHOTOS_PER_EXHIBITION 必须为正数")
      _ <- Either.cond(maxBytesPerExhibition > 0, (), "CONTRIBUTION_MAX_BYTES_PER_EXHIBITION 必须为正数")
    yield ContributionConfig(
      maxFileBytes = maxFileMb * Megabyte,
      maxBatchFiles = maxBatchFiles,
      maxPhotosPerUser = maxPhotosPerUser,
      maxBytesPerUser = maxBytesPerUser,
      maxPhotosPerExhibition = maxPhotosPerExhibition,
      maxBytesPerExhibition = maxBytesPerExhibition
    )
