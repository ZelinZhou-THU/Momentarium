import {
  requireArray,
  requireNumber,
  requireObject,
  requireOneOf,
  requireString,
  requireStringArray,
} from "../../apis/shared/decode";
import { parseCoverView } from "./CoverView";
import type { CoverView } from "./CoverView";
import { PUBLIC_LOCATION_GRANULARITY_VALUES } from "./PublicPhotoLocation";
import type { PublicLocationGranularity } from "./PublicPhotoLocation";

/** 契约 §2.1 AuthorExhibitionCard：作者主页上的一个已发布展览（取自 active 快照）。 */
export interface AuthorExhibitionCard {
  readonly id: string;
  readonly title: string;
  readonly narration: string;
  readonly cover: CoverView;
  readonly version: number;
  readonly publishedAt: string;
  /** 快照绑定场景的主色，用于卡片配色；快照早于 v1.5 时为空。 */
  readonly scenePalette: readonly string[];
}

/** 契约 §2.1（v1.8）AuthorJourneyLocation：作者主页足迹地图上的一个已发布公开地点。 */
export interface AuthorJourneyLocation {
  readonly exhibitionId: string;
  readonly exhibitionTitle: string;
  readonly photoId: string;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  /** 只有公开粒度 area/exact（hidden/suggested 永不出现在足迹里）。 */
  readonly granularity: PublicLocationGranularity;
}

/** 契约 §2.1 AuthorPageView(username, displayName, bio, exhibitions, journeyLocations)。 */
export interface AuthorPageView {
  readonly username: string;
  readonly displayName: string;
  readonly bio: string;
  readonly exhibitions: readonly AuthorExhibitionCard[];
  /**
   * 跨展览公开地点，顺序为展览 publishedAt 倒序、同展览内快照顺序；
   * 旧响应缺该字段时按 [] 解码（公开页正常显示无地图）。
   */
  readonly journeyLocations: readonly AuthorJourneyLocation[];
}

const parseAuthorExhibitionCard = (value: unknown, path: string): AuthorExhibitionCard => {
  const record = requireObject(value, path);
  return {
    id: requireString(record.id, `${path}.id`),
    title: requireString(record.title, `${path}.title`),
    narration: requireString(record.narration, `${path}.narration`),
    cover: parseCoverView(record.cover, `${path}.cover`),
    version: requireNumber(record.version, `${path}.version`),
    publishedAt: requireString(record.publishedAt, `${path}.publishedAt`),
    scenePalette: requireStringArray(record.scenePalette, `${path}.scenePalette`),
  };
};

const parseJourneyLocation = (value: unknown, path: string): AuthorJourneyLocation => {
  const record = requireObject(value, path);
  return {
    exhibitionId: requireString(record.exhibitionId, `${path}.exhibitionId`),
    exhibitionTitle: requireString(record.exhibitionTitle, `${path}.exhibitionTitle`),
    photoId: requireString(record.photoId, `${path}.photoId`),
    name: requireString(record.name, `${path}.name`),
    latitude: requireNumber(record.latitude, `${path}.latitude`),
    longitude: requireNumber(record.longitude, `${path}.longitude`),
    granularity: requireOneOf(
      record.granularity,
      PUBLIC_LOCATION_GRANULARITY_VALUES,
      `${path}.granularity`,
    ),
  };
};

export const parseAuthorPageView = (value: unknown, path = "authorPage"): AuthorPageView => {
  const record = requireObject(value, path);
  return {
    username: requireString(record.username, `${path}.username`),
    displayName: requireString(record.displayName, `${path}.displayName`),
    bio: requireString(record.bio, `${path}.bio`),
    exhibitions: requireArray(record.exhibitions, `${path}.exhibitions`).map((item, index) =>
      parseAuthorExhibitionCard(item, `${path}.exhibitions[${index}]`),
    ),
    // v1.8 新增字段：旧响应没有它时按空数组兼容（作者主页不显示足迹地图）。
    journeyLocations:
      record.journeyLocations === undefined
        ? []
        : requireArray(record.journeyLocations, `${path}.journeyLocations`).map((item, index) =>
            parseJourneyLocation(item, `${path}.journeyLocations[${index}]`),
          ),
  };
};
