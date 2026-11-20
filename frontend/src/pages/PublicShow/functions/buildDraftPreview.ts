import type { PhotoAnalysisView } from "../../../objects/curation/PhotoInsightsResponse";
import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";
import type { PhotoView } from "../../../objects/gallery/PhotoView";
import type {
  PublicExhibitionView,
  PublicPhotoReading,
  PublicPhotoView,
} from "../../../objects/gallery/PublicExhibitionView";
import type { SceneRunView } from "../../../objects/gallery/SceneRunView";
import { formatPublishedAt, formatVersion } from "./formatPublishedAt";
import { projectPublicLocations } from "./publicLocations";
import type { ShowPresentation } from "../objects/ShowPresentation";

/** 草稿能否预览：需要最近一次场景运行已通过评审、有场景代码，且运行用到的照片都还在。 */
export type DraftPreviewCheck =
  | { readonly kind: "ok"; readonly run: SceneRunView; readonly code: string }
  | { readonly kind: "unavailable"; readonly reason: string };

/** 草稿里的全部照片（章节内在前、未分组在后）。 */
export const draftPhotos = (detail: ExhibitionDetail): readonly PhotoView[] => [
  ...detail.groups.flatMap((group) => group.photos),
  ...detail.ungroupedPhotos,
];

export const checkDraftPreview = (detail: ExhibitionDetail): DraftPreviewCheck => {
  // v1.14：草稿当前场景读指针 currentSceneRun，不能把最新运行（可能是未采用修订候选）当当前。
  const run = detail.currentSceneRun;
  if (run === null || run.status !== "succeeded" || run.code === null) {
    return {
      kind: "unavailable",
      reason: "这场展览还没有通过评审的三维场景。先在工作台「三维场景」生成，评审通过后就能看展。",
    };
  }
  const photoIds = new Set(draftPhotos(detail).map((photo) => photo.id));
  if (!run.photoIds.every((photoId) => photoIds.has(photoId))) {
    return {
      kind: "unavailable",
      reason: "场景用到的照片已经被删除，请在工作台重新生成三维场景后再看展。",
    };
  }
  return { kind: "ok", run, code: run.code };
};

/** 预览所需的全部输入：草稿、通过评审的场景、预先取回的本地图片地址与照片 AI 解读。 */
export interface DraftPreviewSource {
  readonly detail: ExhibitionDetail;
  readonly run: SceneRunView;
  readonly imageUrls: ReadonlyMap<string, string>;
  readonly coverUrl: string;
  readonly analyses: readonly PhotoAnalysisView[];
}

/** 照片分析缓存 → 看展界面的解读（与发布时冻结进快照的字段一致）。 */
const toReading = ({ analysis }: PhotoAnalysisView): PublicPhotoReading => ({
  palette: analysis.palette,
  poeticLine: analysis.suggestedCaption,
  sensory: analysis.sensory,
});

const toPublicPhoto = (
  photo: PhotoView,
  imageUrls: ReadonlyMap<string, string>,
  readings: ReadonlyMap<string, PublicPhotoReading>,
): PublicPhotoView => {
  const imageUrl = imageUrls.get(photo.id) ?? "";
  return {
    id: photo.id,
    width: photo.width,
    height: photo.height,
    caption: photo.caption,
    contentUrl: imageUrl,
    thumbUrl: imageUrl,
    reading: readings.get(photo.id) ?? null,
    // 作者预览与公开页同口径：草稿已采用的讲述（公开视图不公开来源投稿/账号）。
    memories: photo.memories.map((memory) => ({
      text: memory.text,
      contributorName: memory.contributorName,
    })),
  };
};

/**
 * 把作者的草稿详情转成看展界面使用的展览视图（与公开页同构）：
 * 章节按草稿顺序；photos 按场景运行快照 photoIds 的顺序（即沙箱 ctx.photos 顺序）；
 * 图片地址是页面预先用令牌取回的本地 object URL（作者照片路由需要令牌，不能直接放进 <img>）；
 * 照片解读直接取分析缓存（发布时才冻结），场景主色取当前采用场景（指针），与公开页快照的配色来源同口径。
 */
export const buildDraftPreviewExhibition = ({
  detail,
  run,
  imageUrls,
  coverUrl,
  analyses,
}: DraftPreviewSource): PublicExhibitionView => {
  const photosById = new Map(draftPhotos(detail).map((photo): [string, PhotoView] => [photo.id, photo]));
  const readings = new Map(analyses.map((view): [string, PublicPhotoReading] => [view.photoId, toReading(view)]));
  return {
    id: detail.id,
    version: detail.publication?.version ?? 0,
    title: detail.title,
    narrative: detail.narrative,
    narration: run.brief?.entranceNarration ?? "",
    cover: { ...detail.cover, imageUrl: coverUrl },
    groups: detail.groups.map((group) => ({
      id: group.id,
      title: group.title,
      narrative: group.narrative,
      position: group.position,
      photos: group.photos.map((photo) => toPublicPhoto(photo, imageUrls, readings)),
    })),
    photos: run.photoIds
      .map((photoId) => photosById.get(photoId))
      .filter((photo): photo is PhotoView => photo !== undefined)
      .map((photo) => toPublicPhoto(photo, imageUrls, readings)),
    publishedAt: detail.updatedAt,
    author: null,
    scenePalette: detail.scenePalette,
    // 预览用当前草稿的公开投影（与发布会冻结的内容同口径）；照片顺序按场景快照。
    locations: [...projectPublicLocations(detail.locations, run.photoIds)],
  };
};

/** 公开页外框：版本与发布时间。 */
export const publicShowPresentation = (exhibition: PublicExhibitionView): ShowPresentation => ({
  eyebrow: "Momentarium · 公开记忆场景",
  versionLabel: `${formatVersion(exhibition.version)} · 发布于 ${formatPublishedAt(exhibition.publishedAt)}`,
  sceneBadge: `第 ${exhibition.version} 版`,
  notice: null,
  backLink: null,
});

/** 草稿预览外框：明确"只有你能看到"，并说明与已发布版本的关系。 */
export const draftPreviewPresentation = (detail: ExhibitionDetail): ShowPresentation => ({
  eyebrow: "Momentarium · 看展预览（只有你能看到）",
  versionLabel:
    detail.publication === null
      ? "草稿预览 · 尚未发布"
      : detail.hasUnpublishedChanges
        ? `草稿预览 · 含${formatVersion(detail.publication.version)}之后未发布的修改`
        : `草稿预览 · 与已发布的${formatVersion(detail.publication.version)}一致`,
  sceneBadge: "草稿预览",
  notice: detail.sceneStale ? "场景是按较早的策展内容生成的，章节与图注以当前草稿为准。" : null,
  backLink: { label: "← 返回工作台", to: `/exhibitions/${detail.id}` },
});
