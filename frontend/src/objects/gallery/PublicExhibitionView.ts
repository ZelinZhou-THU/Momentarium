import {
  requireArray,
  requireNullable,
  requireNumber,
  requireObject,
  requireString,
  requireStringArray,
} from "../../apis/shared/decode";
import { parseCoverView } from "./CoverView";
import type { CoverView } from "./CoverView";
import { parsePublicPhotoLocation } from "./PublicPhotoLocation";
import type { PublicPhotoLocation } from "./PublicPhotoLocation";

/**
 * 契约 §2.1 公开视图（getpublishedexhibition 响应）：只含 active 快照内容，草稿不可见。
 * 说明：PublicShow 页面（W4 写域）当前有同构的页面级 DTO/解析器；本文件是 apis/gallery
 * 公开 API 客户端的共享类型，后续由 PublicShow owner 决定是否切换引用（避免双向依赖）。
 */
/** 契约 §2.1 PublicPhotoReading（v1.5）：视觉模型对这张照片的解读，发布时冻结进快照。 */
export interface PublicPhotoReading {
  readonly palette: readonly string[];
  readonly poeticLine: string;
  readonly sensory: string;
}

/** 契约 §2.1 PublicPhotoMemory（v1.9）：已发布快照冻结的讲述与署名，不公开来源投稿/账号。 */
export interface PublicPhotoMemory {
  readonly text: string;
  readonly contributorName: string;
}

const parsePublicPhotoMemory = (value: unknown, path: string): PublicPhotoMemory => {
  const record = requireObject(value, path);
  return {
    text: requireString(record.text, `${path}.text`),
    contributorName: requireString(record.contributorName, `${path}.contributorName`),
  };
};

export interface PublicPhotoView {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly caption: string;
  readonly contentUrl: string;
  readonly thumbUrl: string;
  /** 发布时没有分析缓存、或快照早于 v1.5 时为 null。 */
  readonly reading: PublicPhotoReading | null;
  /** v1.9 已采用讲述；旧快照没有该字段时按 [] 兼容。 */
  readonly memories: readonly PublicPhotoMemory[];
}

export interface PublicGroupView {
  readonly id: string;
  readonly title: string;
  readonly narrative: string;
  readonly position: number;
  readonly photos: PublicPhotoView[];
}

/** 契约 §2.1 PublicAuthorView：公开页上的作者入口，仅当作者开启主页时出现。 */
export interface PublicAuthorView {
  readonly username: string;
  readonly displayName: string;
}

const parsePublicAuthorView = (value: unknown, path: string): PublicAuthorView => {
  const record = requireObject(value, path);
  return {
    username: requireString(record.username, `${path}.username`),
    displayName: requireString(record.displayName, `${path}.displayName`),
  };
};

export interface PublicExhibitionView {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly narrative: string;
  readonly narration: string;
  readonly cover: CoverView;
  readonly groups: PublicGroupView[];
  readonly photos: PublicPhotoView[];
  readonly publishedAt: string;
  readonly author: PublicAuthorView | null;
  /** 快照绑定场景的主色（#RRGGBB），界面配色的来源；快照早于 v1.5 时为空。 */
  readonly scenePalette: readonly string[];
  /**
   * 契约 v1.7 公开位置：只含 active 快照里 confirmed 且 granularity != hidden 的位置，
   * 顺序按快照 photos；旧快照没有该字段（或后端尚未升级）时按 [] 解码，不按错误处理。
   */
  readonly locations: PublicPhotoLocation[];
}

const parsePublicPhotoReading = (value: unknown, path: string): PublicPhotoReading => {
  const record = requireObject(value, path);
  return {
    palette: requireStringArray(record.palette, `${path}.palette`),
    poeticLine: requireString(record.poeticLine, `${path}.poeticLine`),
    sensory: requireString(record.sensory, `${path}.sensory`),
  };
};

export const parsePublicPhotoView = (value: unknown, path = "publicPhoto"): PublicPhotoView => {
  const record = requireObject(value, path);
  return {
    id: requireString(record.id, `${path}.id`),
    width: requireNumber(record.width, `${path}.width`),
    height: requireNumber(record.height, `${path}.height`),
    caption: requireString(record.caption, `${path}.caption`),
    contentUrl: requireString(record.contentUrl, `${path}.contentUrl`),
    thumbUrl: requireString(record.thumbUrl, `${path}.thumbUrl`),
    reading: requireNullable(record.reading, `${path}.reading`, parsePublicPhotoReading),
    memories:
      record.memories === undefined
        ? []
        : requireArray(record.memories, `${path}.memories`).map((memory, index) =>
            parsePublicPhotoMemory(memory, `${path}.memories[${index}]`),
          ),
  };
};

export const parsePublicGroupView = (value: unknown, path = "publicGroup"): PublicGroupView => {
  const record = requireObject(value, path);
  return {
    id: requireString(record.id, `${path}.id`),
    title: requireString(record.title, `${path}.title`),
    narrative: requireString(record.narrative, `${path}.narrative`),
    position: requireNumber(record.position, `${path}.position`),
    photos: requireArray(record.photos, `${path}.photos`).map((photo, index) =>
      parsePublicPhotoView(photo, `${path}.photos[${index}]`),
    ),
  };
};

export const parsePublicExhibitionView = (value: unknown, path = "publicExhibition"): PublicExhibitionView => {
  const record = requireObject(value, path);
  return {
    id: requireString(record.id, `${path}.id`),
    version: requireNumber(record.version, `${path}.version`),
    title: requireString(record.title, `${path}.title`),
    narrative: requireString(record.narrative, `${path}.narrative`),
    narration: requireString(record.narration, `${path}.narration`),
    cover: parseCoverView(record.cover, `${path}.cover`),
    groups: requireArray(record.groups, `${path}.groups`).map((group, index) =>
      parsePublicGroupView(group, `${path}.groups[${index}]`),
    ),
    photos: requireArray(record.photos, `${path}.photos`).map((photo, index) =>
      parsePublicPhotoView(photo, `${path}.photos[${index}]`),
    ),
    publishedAt: requireString(record.publishedAt, `${path}.publishedAt`),
    author: requireNullable(record.author, `${path}.author`, parsePublicAuthorView),
    scenePalette: requireStringArray(record.scenePalette, `${path}.scenePalette`),
    // 旧快照（v1.6 及更早）没有 locations：按空数组兼容，公开页正常显示“没有公开位置”。
    locations:
      record.locations === undefined
        ? []
        : requireArray(record.locations, `${path}.locations`).map((location, index) =>
            parsePublicPhotoLocation(location, `${path}.locations[${index}]`),
          ),
  };
};
