package services.system.api

/** 400 VALIDATION 的稳定原因码，前端按键值分支处理。 */
enum ValidationReason:
  case TitleRequired
  case PhotoCount
  case PhotoUngrouped
  case GroupEmpty
  case SceneNotReady
  case SceneStale
  case PhotoLimit
  case UploadTooLarge
  case UploadUnsupportedType
  case InvalidCover
  case CoverTooLarge
  case CoverUnsupportedType
  case UsernameInvalid
  case PasswordWeak
  case SceneRunNotRestorable
  case DisplayNameInvalid
  case BioTooLong
  case PasswordIncorrect
  case LocationNameInvalid
  case LocationCoordinatesInvalid
  case LocationGranularityInvalid
  case PlaceQueryInvalid
  case ContributionMemoryInvalid
  case ContributionBatchLimit
  case ContributionQuotaPhotos
  case ContributionQuotaBytes
  case ContributionSelfNotAllowed
  case ContributionPhotoRequired
  case ContributionCaptionInvalid
  case SceneInstructionInvalid
  case SceneRevisionTooLarge

object ValidationReason:
  def toString(reason: ValidationReason): String =
    reason match
      case ValidationReason.TitleRequired => "TITLE_REQUIRED"
      case ValidationReason.PhotoCount => "PHOTO_COUNT"
      case ValidationReason.PhotoUngrouped => "PHOTO_UNGROUPED"
      case ValidationReason.GroupEmpty => "GROUP_EMPTY"
      case ValidationReason.SceneNotReady => "SCENE_NOT_READY"
      case ValidationReason.SceneStale => "SCENE_STALE"
      case ValidationReason.PhotoLimit => "PHOTO_LIMIT"
      case ValidationReason.UploadTooLarge => "UPLOAD_TOO_LARGE"
      case ValidationReason.UploadUnsupportedType => "UPLOAD_UNSUPPORTED_TYPE"
      case ValidationReason.InvalidCover => "INVALID_COVER"
      case ValidationReason.CoverTooLarge => "COVER_TOO_LARGE"
      case ValidationReason.CoverUnsupportedType => "COVER_UNSUPPORTED_TYPE"
      case ValidationReason.UsernameInvalid => "USERNAME_INVALID"
      case ValidationReason.PasswordWeak => "PASSWORD_WEAK"
      case ValidationReason.SceneRunNotRestorable => "SCENE_RUN_NOT_RESTORABLE"
      case ValidationReason.DisplayNameInvalid => "DISPLAY_NAME_INVALID"
      case ValidationReason.BioTooLong => "BIO_TOO_LONG"
      case ValidationReason.PasswordIncorrect => "PASSWORD_INCORRECT"
      case ValidationReason.LocationNameInvalid => "LOCATION_NAME_INVALID"
      case ValidationReason.LocationCoordinatesInvalid => "LOCATION_COORDINATES_INVALID"
      case ValidationReason.LocationGranularityInvalid => "LOCATION_GRANULARITY_INVALID"
      case ValidationReason.PlaceQueryInvalid => "PLACE_QUERY_INVALID"
      case ValidationReason.ContributionMemoryInvalid => "CONTRIBUTION_MEMORY_INVALID"
      case ValidationReason.ContributionBatchLimit => "CONTRIBUTION_BATCH_LIMIT"
      case ValidationReason.ContributionQuotaPhotos => "CONTRIBUTION_QUOTA_PHOTOS"
      case ValidationReason.ContributionQuotaBytes => "CONTRIBUTION_QUOTA_BYTES"
      case ValidationReason.ContributionSelfNotAllowed => "CONTRIBUTION_SELF_NOT_ALLOWED"
      case ValidationReason.ContributionPhotoRequired => "CONTRIBUTION_PHOTO_REQUIRED"
      case ValidationReason.ContributionCaptionInvalid => "CONTRIBUTION_CAPTION_INVALID"
      case ValidationReason.SceneInstructionInvalid => "SCENE_INSTRUCTION_INVALID"
      case ValidationReason.SceneRevisionTooLarge => "SCENE_REVISION_TOO_LARGE"
