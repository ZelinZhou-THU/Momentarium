import {
  requireArray,
  requireBoolean,
  requireNullable,
  requireNumber,
  requireObject,
  requireString,
  requireStringArray,
} from "../../apis/shared/decode";
import { parseCoverView } from "./CoverView";
import type { CoverView } from "./CoverView";
import { parseGroupView } from "./GroupView";
import type { GroupView } from "./GroupView";
import { parsePhotoView } from "./PhotoView";
import type { PhotoView } from "./PhotoView";
import { parsePhotoLocationView } from "./PhotoLocationView";
import type { PhotoLocationView } from "./PhotoLocationView";
import { parsePublicationSummary } from "./PublicationSummary";
import type { PublicationSummary } from "./PublicationSummary";
import { parseSceneRunView } from "./SceneRunView";
import type { SceneRunView } from "./SceneRunView";

/** 契约 §2.1 ExhibitionDetail：工作台加载所需的完整草稿。 */
export interface ExhibitionDetail {
  readonly id: string;
  readonly title: string;
  readonly narrative: string;
  readonly updatedAt: string;
  readonly groups: GroupView[];
  readonly ungroupedPhotos: PhotoView[];
  /** 当前采用场景（v1.14 指针）；null 表示从未成功生成/未采用。 */
  readonly currentSceneRun: SceneRunView | null;
  /** 最新运行（任意状态，用于进度与候选）；不一定是当前采用场景。 */
  readonly sceneRun: SceneRunView | null;
  readonly sceneStale: boolean;
  readonly cover: CoverView;
  readonly publication: PublicationSummary | null;
  readonly hasUnpublishedChanges: boolean;
  /** v1.15：待创建者处理的投稿数，与列表摘要同口径；工作台「投稿」页签徽标用。 */
  readonly pendingContributionCount: number;
  /** 当前采用场景题面的主色（#RRGGBB），展览界面配色的来源；没有当前场景时为空。 */
  readonly scenePalette: readonly string[];
  /**
   * 契约 v1.7 位置：草稿照片的 suggested/confirmed 位置，顺序按详情里的照片展示顺序；
   * 没有位置记录的照片不出现（无记录 = 未知）。始终存在，无位置时为 []。
   */
  readonly locations: PhotoLocationView[];
}

export const parseExhibitionDetail = (value: unknown, path = "exhibition"): ExhibitionDetail => {
  const record = requireObject(value, path);
  const sceneRun = requireNullable(record.sceneRun, `${path}.sceneRun`, parseSceneRunView);
  // v1.14 新增 currentSceneRun；旧数据/旧夹具缺字段时回退到 sceneRun（v1.13 语义）。
  const currentSceneRun =
    record.currentSceneRun === undefined
      ? sceneRun
      : requireNullable(record.currentSceneRun, `${path}.currentSceneRun`, parseSceneRunView);
  return {
    id: requireString(record.id, `${path}.id`),
    title: requireString(record.title, `${path}.title`),
    narrative: requireString(record.narrative, `${path}.narrative`),
    updatedAt: requireString(record.updatedAt, `${path}.updatedAt`),
    groups: requireArray(record.groups, `${path}.groups`).map((group, index) =>
      parseGroupView(group, `${path}.groups[${index}]`),
    ),
    ungroupedPhotos: requireArray(record.ungroupedPhotos, `${path}.ungroupedPhotos`).map(
      (photo, index) => parsePhotoView(photo, `${path}.ungroupedPhotos[${index}]`),
    ),
    sceneRun: requireNullable(record.sceneRun, `${path}.sceneRun`, parseSceneRunView),
    currentSceneRun,
    sceneStale: requireBoolean(record.sceneStale, `${path}.sceneStale`),
    cover: parseCoverView(record.cover, `${path}.cover`),
    publication: requireNullable(
      record.publication,
      `${path}.publication`,
      parsePublicationSummary,
    ),
    hasUnpublishedChanges: requireBoolean(
      record.hasUnpublishedChanges,
      `${path}.hasUnpublishedChanges`,
    ),
    pendingContributionCount: requireNumber(
      record.pendingContributionCount,
      `${path}.pendingContributionCount`,
    ),
    scenePalette: requireStringArray(record.scenePalette, `${path}.scenePalette`),
    locations: requireArray(record.locations, `${path}.locations`).map((location, index) =>
      parsePhotoLocationView(location, `${path}.locations[${index}]`),
    ),
  };
};
