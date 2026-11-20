package services.gallery.objects.apiTypes

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ContributorStatus
import services.users.objects.UserId

/** 参与者视图（创建者管理列表）：显示名缺失时回退用户名，状态含 revoked。 */
final case class ContributorView(
  contributorId: UserId,
  username: String,
  displayName: String,
  status: ContributorStatus,
  joinedAt: Instant,
  contributionCount: Int
)

object ContributorView:
  given Encoder[ContributorView] = deriveEncoder[ContributorView]
  given Decoder[ContributorView] = deriveDecoder[ContributorView]
