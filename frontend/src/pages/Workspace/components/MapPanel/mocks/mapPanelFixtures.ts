import type { ExhibitionDetail } from "../../../../../objects/gallery/ExhibitionDetail";
import type { PhotoLocationView } from "../../../../../objects/gallery/PhotoLocationView";
import type { PhotoView } from "../../../../../objects/gallery/PhotoView";

/** 地图分区测试夹具（本地数据，非最终证据）：按契约 v1.7 的 ExhibitionDetail 形状构造。 */

export const createPhotoFixture = (
  id: string,
  caption: string,
  positionInGroup: number | null = null,
): PhotoView => ({
  id,
  originalName: `${id}.jpg`,
  mime: "image/jpeg",
  width: 1600,
  height: 1067,
  caption,
  groupId: positionInGroup === null ? null : "group-1",
  positionInGroup,
  contentUrl: `/api/photos/${id}/content?variant=full`,
  thumbUrl: `/api/photos/${id}/content?variant=thumb`,
  memories: [],
});

export const createPhotoLocationFixture = (
  photoId: string,
  overrides: Partial<PhotoLocationView> = {},
): PhotoLocationView => ({
  photoId,
  source: "manual",
  status: "confirmed",
  name: "济州岛 · 涉地可支",
  latitude: 33.4592,
  longitude: 126.936,
  granularity: "exact",
  ...overrides,
});

export const MAP_PANEL_PHOTOS: readonly PhotoView[] = [
  createPhotoFixture("photo-1", "退潮后的黑色礁石", 0),
  createPhotoFixture("photo-2", "黄昏时分的海面", 1),
  createPhotoFixture("photo-3", "山间的清晨薄雾", 2),
];

export const createMapPanelDetail = (
  overrides: Partial<ExhibitionDetail> = {},
): ExhibitionDetail => ({
  id: "ex-map-1",
  title: "济州岛的海与山",
  narrative: "一次安静的海边旅行。",
  updatedAt: "2026-11-02T09:00:00Z",
  groups: [
    { id: "group-1", title: "退潮的礁石", narrative: "", position: 0, photos: [...MAP_PANEL_PHOTOS] },
  ],
  ungroupedPhotos: [],
  sceneRun: null,
  currentSceneRun: null,  sceneStale: false,
  cover: { kind: "auto", imageUrl: "/api/exhibitions/ex-map-1/cover", width: 1600, height: 1067 },
  publication: null,
  hasUnpublishedChanges: false,
  pendingContributionCount: 0,
  scenePalette: [],
  locations: [
    createPhotoLocationFixture("photo-1"),
    createPhotoLocationFixture("photo-2", {
      source: "exif",
      status: "suggested",
      name: "",
      latitude: null,
      longitude: null,
      granularity: "hidden",
    }),
  ],
  ...overrides,
});
