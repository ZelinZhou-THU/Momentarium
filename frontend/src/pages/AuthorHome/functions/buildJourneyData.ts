import { geoPointOrNull } from "../../../objects/gallery/GeoPoint";
import type { GeoPoint } from "../../../objects/gallery/GeoPoint";
import type { AuthorPageView, AuthorJourneyLocation } from "../../../objects/gallery/AuthorPageView";
import type { ClusterMapMarker } from "../../../maps/clusterSession";

/**
 * 足迹地图的页面数据装配（纯函数）：
 * - 只把合法坐标、非 hidden 的公开地点放上地图（服务端已按 active 快照过滤，这里防御性再收窄）；
 * - 分组按响应顺序（展览 publishedAt 倒序、同展览内快照顺序）保持稳定；
 * - 缩略图与展览链接统一在这里生成，弹窗与降级列表共用同一套 URL。
 */
export interface JourneyMarker {
  readonly id: string;
  readonly point: GeoPoint;
  readonly name: string;
  readonly exhibitionId: string;
  readonly exhibitionTitle: string;
  readonly photoId: string;
}

export interface JourneyGroup {
  readonly exhibitionId: string;
  readonly exhibitionTitle: string;
  readonly locations: readonly JourneyMarker[];
}

export interface JourneyMapData {
  readonly markers: readonly JourneyMarker[];
  readonly groups: readonly JourneyGroup[];
  readonly summary: string;
}

/** 弹窗缩略图路径（评审批次约定：公开照片缩略图不带令牌）。 */
export const journeyThumbUrl = (photoId: string): string =>
  `/api/photos/${encodeURIComponent(photoId)}/content?variant=thumb`;

/** 展览公开链接。 */
export const journeyExhibitionPath = (exhibitionId: string): string =>
  `/show/${encodeURIComponent(exhibitionId)}`;

const markerOf = (location: AuthorJourneyLocation): JourneyMarker | null => {
  const point = geoPointOrNull(location.latitude, location.longitude);
  if (point === null) {
    return null;
  }
  return {
    id: `${location.exhibitionId}:${location.photoId}`,
    point,
    name: location.name,
    exhibitionId: location.exhibitionId,
    exhibitionTitle: location.exhibitionTitle,
    photoId: location.photoId,
  };
};

const groupMarkers = (markers: readonly JourneyMarker[]): readonly JourneyGroup[] => {
  const groups: JourneyGroup[] = [];
  markers.forEach((marker) => {
    const current = groups[groups.length - 1];
    if (current !== undefined && current.exhibitionId === marker.exhibitionId) {
      groups[groups.length - 1] = { ...current, locations: [...current.locations, marker] };
      return;
    }
    const existing = groups.find((group) => group.exhibitionId === marker.exhibitionId);
    if (existing === undefined) {
      groups.push({
        exhibitionId: marker.exhibitionId,
        exhibitionTitle: marker.exhibitionTitle,
        locations: [marker],
      });
      return;
    }
    const index = groups.indexOf(existing);
    groups[index] = { ...existing, locations: [...existing.locations, marker] };
  });
  return groups;
};

export const buildJourneyData = (page: AuthorPageView): JourneyMapData => {
  const markers = page.journeyLocations.flatMap((location) => {
    const marker = markerOf(location);
    return marker === null ? [] : [marker];
  });
  const groups = groupMarkers(markers);
  return {
    markers,
    groups,
    summary: `共 ${markers.length} 个公开地点 · ${groups.length} 场展览`,
  };
};

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** 弹窗内容是 HTML 字符串，名称/标题来自作者输入，必须转义后再拼接。 */
export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);

const displayNameOf = (marker: JourneyMarker): string =>
  marker.name.trim() === "" ? "未命名地点" : marker.name.trim();

/** 标记弹窗：缩略图 + 地点名 + 展览名 + 查看展览链接（leaflet bindPopup 的 HTML）。 */
export const buildJourneyPopupHtml = (marker: JourneyMarker): string => {
  const name = escapeHtml(displayNameOf(marker));
  const exhibitionTitle = escapeHtml(marker.exhibitionTitle);
  return [
    '<div class="flex w-40 flex-col gap-2">',
    `<img src="${escapeHtml(journeyThumbUrl(marker.photoId))}" alt="${name}" loading="lazy" class="h-20 w-32 rounded-md object-cover" />`,
    `<p class="text-caption font-medium text-ink">${name}</p>`,
    `<p class="text-micro text-muted">${exhibitionTitle}</p>`,
    `<a href="${escapeHtml(journeyExhibitionPath(marker.exhibitionId))}" class="text-caption text-accent underline-offset-4 hover:underline">查看展览</a>`,
    "</div>",
  ].join("");
};

/** 纯数据 → 聚类地图标记（弹窗 HTML 在这里一次性生成）。 */
export const buildJourneyClusterMarkers = (
  markers: readonly JourneyMarker[],
): readonly ClusterMapMarker[] =>
  markers.map((marker) => ({
    id: marker.id,
    point: marker.point,
    label: displayNameOf(marker),
    popupHtml: buildJourneyPopupHtml(marker),
  }));
