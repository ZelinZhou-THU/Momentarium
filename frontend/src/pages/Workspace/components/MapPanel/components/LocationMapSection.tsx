import { useMemo, useState } from "react";
import { Button } from "../../../../../components/ui";
import { MapView } from "../../../../../maps/MapView";
import type { MapLoadState } from "../../../../../maps/MapView";
import { MAP_PRIVACY_NOTICE } from "../../../../../maps/mapNotices";
import { useOnlineStatus } from "../../../../../maps/useOnlineStatus";
import type { GeoPoint } from "../../../../../objects/gallery/GeoPoint";
import { buildLocationMarkers, selectedMarkerIdOf } from "../functions/buildLocationMarkers";
import type { LocationRow } from "../functions/buildLocationRows";
import { countLocatedRows, rowsWithPoints } from "../functions/buildLocationRows";
import { describeMapFallbackHint, MAP_PICK_HINT } from "../functions/describeLocation";
import type { MapAvailability } from "../objects/MapPanelState";

export interface LocationMapSectionProps {
  readonly rows: readonly LocationRow[];
  readonly selectedRow: LocationRow | null;
  readonly onSelectMarker: (photoId: string) => void;
  readonly onPickPoint: (point: GeoPoint) => void;
}

/**
 * 工作台地图分区：默认不加载在线地图（先说明外部依赖）；开启后按需加载 Leaflet 与 OSM 瓦片。
 * 地图不可用或断网时只显示提示并退回位置列表与编辑，不阻断其他分区。
 */
export function LocationMapSection({
  rows,
  selectedRow,
  onSelectMarker,
  onPickPoint,
}: LocationMapSectionProps) {
  const online = useOnlineStatus();
  const [enabled, setEnabled] = useState(false);
  const [availability, setAvailability] = useState<MapAvailability>("closed");
  const markers = useMemo(() => buildLocationMarkers(rows), [rows]);
  const selectedMarkerId = selectedMarkerIdOf(selectedRow);
  const hint = describeMapFallbackHint(availability, online);
  const mappedCount = rowsWithPoints(rows).length;

  const handleLoadState = (state: MapLoadState): void => setAvailability(state);

  const openMap = (): void => {
    setEnabled(true);
    setAvailability("loading");
  };

  const closeMap = (): void => {
    setEnabled(false);
    setAvailability("closed");
  };

  return (
    <section className="min-w-0 rounded-xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-serif text-h2 text-ink">展览地图</h2>
          <p className="mt-1 text-micro text-muted">
            已定位 {countLocatedRows(rows)} 张 · {mappedCount} 个点可显示在地图上
          </p>
        </div>
        {enabled ? (
          <Button variant="ghost" size="sm" onClick={closeMap}>
            关闭地图
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={openMap}>
            开启在线地图
          </Button>
        )}
      </div>

      {enabled ? (
        rows.length === 0 ? (
          <p className="mt-4 text-caption text-muted">
            还没有照片，地图暂时没有可显示的位置。
          </p>
        ) : (
          <div className="mt-4">
            <MapView
              markers={markers}
              selectedMarkerId={selectedMarkerId}
              onSelectMarker={onSelectMarker}
              onPickPoint={onPickPoint}
              ariaLabel="展览位置地图"
              onLoadStateChange={handleLoadState}
            />
          </div>
        )
      ) : (
        <p className="mt-3 text-caption text-muted">{MAP_PRIVACY_NOTICE}</p>
      )}

      {enabled && availability === "ready" ? (
        <p className="mt-3 text-caption text-muted">{MAP_PICK_HINT}</p>
      ) : null}
      {enabled && availability === "ready" && mappedCount === 0 && rows.length > 0 ? (
        <p className="mt-2 text-caption text-muted">
          还没有带坐标的位置。可以搜索地点，或在地图上点击任意位置落点。
        </p>
      ) : null}
      {hint === null ? null : (
        <p
          className={
            hint.tone === "warning" ? "mt-3 text-caption text-danger" : "mt-3 text-caption text-muted"
          }
        >
          {hint.message}
        </p>
      )}
    </section>
  );
}
