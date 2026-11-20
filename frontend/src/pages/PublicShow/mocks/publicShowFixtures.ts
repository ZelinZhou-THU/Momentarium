import type { SandboxPhotoTransfer } from "../../../scene/contract";
import type { PublicPhotoLocation } from "../../../objects/gallery/PublicPhotoLocation";
import type {
  PublicExhibitionView,
  PublicGroupView,
  PublicPhotoView,
} from "../functions/publicShowDtos";
import type { PublishedSceneResponse } from "../functions/publicShowDtos";
import type { PublicPlayingScene } from "../objects/PublicShowState";

/**
 * 公开页本地 fixture（mock/fixture，非最终证据）：
 * 后端 getpublishedexbition/getpublishedscene 就绪前，用于驱动状态机/渲染测试与本地联调。
 * D6 共享实例窗口会换成真实后端返回（见 task-40 证据）。
 */
export const createPublicPhotoFixture = (
  id: string,
  caption: string,
  memories: PublicPhotoView["memories"] = [],
): PublicPhotoView => ({
  id,
  width: 2048,
  height: 1365,
  caption,
  contentUrl: `/api/photos/${id}/content?variant=full`,
  thumbUrl: `/api/photos/${id}/content?variant=thumb`,
  reading: null,
  memories,
});

const PHOTO_ONE = createPublicPhotoFixture("photo-jeju-01", "退潮后的黑色礁石");
const PHOTO_TWO = createPublicPhotoFixture("photo-jeju-02", "黄昏时分的海面");
const PHOTO_THREE = createPublicPhotoFixture("photo-jeju-03", "山间的清晨薄雾");

/** 已发布公开位置（旧快照可能没有：公开页此时不显示地图入口）。 */
const PUBLIC_LOCATIONS: readonly PublicPhotoLocation[] = [
  {
    photoId: PHOTO_ONE.id,
    name: "济州岛 · 涉地可支",
    granularity: "area",
    latitude: 33.4592,
    longitude: 126.936,
  },
  {
    photoId: PHOTO_TWO.id,
    name: "济州岛 · 城山日出峰",
    granularity: "exact",
    latitude: 33.4587,
    longitude: 126.9422,
  },
];

const createPublicGroupsFixture = (): PublicGroupView[] => [
  {
    id: "group-01",
    title: "退潮的礁石",
    narrative: "海水退去后留下的黑色玄武岩。",
    position: 0,
    photos: [PHOTO_ONE, PHOTO_TWO],
  },
  {
    id: "group-02",
    title: "远处的光",
    narrative: "记忆里最后一段山路。",
    position: 1,
    photos: [PHOTO_THREE],
  },
];

export const createPublicExhibitionFixture = (
  overrides: Partial<PublicExhibitionView> = {},
): PublicExhibitionView => ({
  id: "exhibition-public-01",
  version: 2,
  title: "济州岛的海与山",
  narrative: "一次安静的海边旅行，照片记录下退潮、黄昏与清晨。",
  narration: "沿着潮声走进这片黄昏，让照片在记忆里慢慢亮起来。",
  cover: {
    kind: "photo",
    imageUrl: "/api/exhibitions/exhibition-public-01/cover",
    width: 2048,
    height: 1365,
  },
  groups: createPublicGroupsFixture(),
  photos: [PHOTO_ONE, PHOTO_TWO, PHOTO_THREE],
  publishedAt: "2026-10-27T15:00:00Z",
  author: null,
  scenePalette: [],
  locations: [...PUBLIC_LOCATIONS],
  ...overrides,
});

export const createPublishedSceneFixture = (
  overrides: Partial<PublishedSceneResponse> = {},
): PublishedSceneResponse => ({
  code: "function build(ctx) { ctx.setBackground(0x0f172a); }",
  runtimeVersion: "1",
  generatedAt: "2026-10-27T14:58:00Z",
  ...overrides,
});

export const createSandboxPhotosFixture = (
  photos: readonly PublicPhotoView[],
): readonly SandboxPhotoTransfer[] =>
  photos.map((photo) => ({
    id: photo.id,
    width: 2048,
    height: 1365,
    aspect: 2048 / 1365,
    mimeType: "image/jpeg",
    buffer: new ArrayBuffer(8),
  }));

export const createPublicPlayingSceneFixture = (
  exhibition: PublicExhibitionView = createPublicExhibitionFixture(),
): PublicPlayingScene => ({
  scene: createPublishedSceneFixture(),
  photos: createSandboxPhotosFixture(exhibition.photos),
});
