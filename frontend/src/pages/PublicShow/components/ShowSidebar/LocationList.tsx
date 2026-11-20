import { useMemo, useState } from "react";
import { Button } from "../../../../components/ui";
import { classNames } from "../../../../components/ui/classNames";
import { MapView } from "../../../../maps/MapView";
import type { MapLoadState } from "../../../../maps/MapView";
import { useOnlineStatus } from "../../../../maps/useOnlineStatus";
import { buildPublicMapMarkers } from "../../functions/publicLocations";
import type { PublicMapLocation } from "../../functions/publicLocations";
import { describePublicMapStatus } from "../../functions/publicLocations";
import { photoLineOf } from "../../functions/buildShowStops";

export interface LocationListProps {
  readonly locations: readonly PublicMapLocation[];
  readonly onOpenPhoto: (photoId: string) => void;
}

/**
 * 公开页侧栏的「地图」模式内容：只读已发布公开位置。
 * 默认不加载在线地图（先说明外部依赖）；点击标记打开现有大图导览，点选下方照片定位地图。
 * 地图不可用/断网时提示原因，章节模式仍可继续浏览；没有公开位置时本组件不会被渲染。
 */
export function LocationList({ locations, onOpenPhoto }: LocationListProps) {
  const online = useOnlineStatus();
  const [enabled, setEnabled] = useState(false);
  const [loadState, setLoadState] = useState<MapLoadState>("loading");
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(
    () => locations[0]?.photo.id ?? null,
  );
  const markers = useMemo(() => buildPublicMapMarkers(locations), [locations]);
  const status = describePublicMapStatus(enabled ? loadState : "idle", online);

  return (
    <div className="px-6 py-6">
      {enabled ? (
        <MapView
          markers={markers}
          selectedMarkerId={selectedPhotoId}
          onSelectMarker={onOpenPhoto}
          ariaLabel="公开位置地图"
          onLoadStateChange={setLoadState}
        />
      ) : (
        <div className="rounded-md border border-surface/10 bg-night/40 px-4 py-4">
          <p className="text-caption text-surface/80">
            公开地图是可选项：会加载 OpenStreetMap 公共瓦片，向提供方暴露访问者 IP 与浏览区域；
            不携带照片、回忆或邀请令牌。
          </p>
          <Button
            variant="inversePrimary"
            size="sm"
            className="mt-3"
            onClick={() => setEnabled(true)}
          >
            开启公开地图
          </Button>
        </div>
      )}

      {status === null ? null : <p className="mt-3 text-micro text-surface/65">{status}</p>}
      {enabled && loadState === "ready" ? (
        <p className="mt-3 text-micro text-surface/65">
          点击地图标记查看照片大图；点选下方照片可定位地图。
        </p>
      ) : null}

      <ul className="mt-4 flex flex-col gap-2">
        {locations.map((row) => {
          const selected = row.photo.id === selectedPhotoId;
          return (
            <li key={row.photo.id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => setSelectedPhotoId(row.photo.id)}
                className={classNames(
                  "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors duration-150 ease-out motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-night",
                  selected
                    ? "border-accentSoft bg-surface/10"
                    : "border-surface/10 bg-transparent hover:bg-surface/10",
                )}
              >
                <img
                  src={row.photo.thumbUrl}
                  alt={row.photo.caption}
                  className="h-12 w-12 shrink-0 rounded-md border border-surface/10 object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-caption text-surface">
                    {row.location.name.trim() === "" ? "未命名地点" : row.location.name}
                  </span>
                  <span className="block truncate text-micro text-surface/65">
                    {row.location.granularity === "area" ? "公开范围" : "公开精确点"}
                    {photoLineOf(row.photo) === "" ? "" : ` · ${photoLineOf(row.photo)}`}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
