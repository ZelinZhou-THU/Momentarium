package services.gallery.objects.apiTypes

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.gallery.objects.ExhibitionId
import services.scene.objects.apiTypes.SceneRunView

/**
 * 工作台加载所需的完整草稿：策展内容、最新场景运行与发布摘要（未生成 / 未发布时为 None）。
 *
 * v1.14 起显式区分两种场景：
 * - `currentSceneRun`：当前采用场景指针（gallery.exhibitions.current_scene_run_id），
 *   发布、sceneStale、草稿配色与未发布修改都以它为准；
 * - `sceneRun`：最新一次运行（任意状态，用于进度与候选展示）；修订成功只是候选，不得当当前场景。
 * pendingContributionCount（v1.15）= 待创建者处理的投稿数，与列表摘要同口径，供工作台「投稿」页签徽标；
 * scenePalette 是当前采用场景题面的主色（没有当前场景时为空列表）；
 * locations 是草稿照片的 suggested/confirmed 位置（无记录的照片不出现在数组，数组顺序有契约意义）。
 */
final case class ExhibitionDetail(
  id: ExhibitionId,
  title: String,
  narrative: String,
  updatedAt: Instant,
  groups: List[GroupView],
  ungroupedPhotos: List[PhotoView],
  sceneRun: Option[SceneRunView],
  sceneStale: Boolean,
  cover: CoverView,
  publication: Option[PublicationSummary],
  hasUnpublishedChanges: Boolean,
  pendingContributionCount: Int,
  scenePalette: List[String],
  locations: List[PhotoLocationView] = Nil,
  currentSceneRun: Option[SceneRunView] = None
)

object ExhibitionDetail:
  given Encoder[ExhibitionDetail] = deriveEncoder[ExhibitionDetail]
  given Decoder[ExhibitionDetail] = deriveDecoder[ExhibitionDetail]
