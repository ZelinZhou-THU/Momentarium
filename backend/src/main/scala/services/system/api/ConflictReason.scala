package services.system.api

/** 409 CONFLICT 的稳定原因码。 */
enum ConflictReason:
  case UsernameTaken
  case VersionConflict
  case SceneRunActive
  case InviteClosed
  case ParticipantRevoked
  case ContributionWithdrawn
  case ContributionVersionConflict
  case ContributionTargetConflict
  case ContributionAlreadyAdopted
  case ContributionDeclined
  case SceneRevisionStale
  case SceneRunNotAcceptable

object ConflictReason:
  def toString(reason: ConflictReason): String =
    reason match
      case ConflictReason.UsernameTaken => "USERNAME_TAKEN"
      case ConflictReason.VersionConflict => "VERSION_CONFLICT"
      case ConflictReason.SceneRunActive => "SCENE_RUN_ACTIVE"
      case ConflictReason.InviteClosed => "INVITE_CLOSED"
      case ConflictReason.ParticipantRevoked => "PARTICIPANT_REVOKED"
      case ConflictReason.ContributionWithdrawn => "CONTRIBUTION_WITHDRAWN"
      case ConflictReason.ContributionVersionConflict => "CONTRIBUTION_VERSION_CONFLICT"
      case ConflictReason.ContributionTargetConflict => "CONTRIBUTION_TARGET_CONFLICT"
      case ConflictReason.ContributionAlreadyAdopted => "CONTRIBUTION_ALREADY_ADOPTED"
      case ConflictReason.ContributionDeclined => "CONTRIBUTION_DECLINED"
      case ConflictReason.SceneRevisionStale => "SCENE_REVISION_STALE"
      case ConflictReason.SceneRunNotAcceptable => "SCENE_RUN_NOT_ACCEPTABLE"
