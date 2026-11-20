package services.users.api

import java.sql.Connection

import cats.effect.IO

import services.system.api.{APIWithTokenMessage, ApiError, ApiException, ValidationReason}
import services.users.objects.{Profile, UserId}
import services.users.objects.apiTypes.ProfileView
import services.users.tables.ProfileTable
import services.users.utils.{CurrentTime, CurrentUser, ProfileRules, ProfileViews}

/** updatemyprofile：校验并整体写入公开资料，返回最新视图。 */
final case class UpdateMyProfileMessage(userId: UserId, displayName: String, bio: String, homepagePublic: Boolean)
    extends APIWithTokenMessage[ProfileView]:
  override def plan(connection: Connection): IO[ProfileView] =
    for
      validName <- IO.fromEither(
                     ProfileRules
                       .normalizeDisplayName(displayName)
                       .left
                       .map(message => ApiException(ApiError.validation(ValidationReason.DisplayNameInvalid, message)))
                   )
      validBio <- IO.fromEither(
                    ProfileRules
                      .normalizeBio(bio)
                      .left
                      .map(message => ApiException(ApiError.validation(ValidationReason.BioTooLong, message)))
                  )
      user <- CurrentUser.require(connection, userId)
      now <- CurrentTime.now
      profile = Profile(userId, validName, validBio, homepagePublic, now)
      _ <- ProfileTable.upsert(connection, profile)
    yield ProfileViews.view(user, Some(profile))
