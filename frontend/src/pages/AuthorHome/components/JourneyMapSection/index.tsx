import { useMemo, useState } from "react";
import { Button } from "../../../../components/ui";
import { ClusterMapPlaceholder, ClusterMapView } from "../../../../maps/ClusterMapView";
import type { ClusterMapLoadState } from "../../../../maps/ClusterMapView";
import type { AuthorPageView } from "../../../../objects/gallery/AuthorPageView";
import {
  buildJourneyClusterMarkers,
  buildJourneyData,
} from "../../functions/buildJourneyData";
import { useInViewport } from "../../hooks/useInViewport";
import { JourneyLocationList } from "./JourneyLocationList";

export interface JourneyMapSectionProps {
  readonly page: AuthorPageView;
}

type MapPanelStatus = "waiting" | ClusterMapLoadState | "degraded";

/**
 * 作者主页足迹地图区域（阶段 1.5）：资料与展览卡片之后的只读跨展览地图。
 * - 只显示作者公开的地点（active 快照 confirmed 且非 hidden）；没有公开位置时整块不显示；
 * - 滚动到附近才加载地图库与瓦片（首屏不做无谓的外部请求）；
 * - 聚类点击放大地图，标记弹窗给出缩略图、地点、展览与「查看展览」链接；
 * - 加载或瓦片失败时降级为按展览分组的位置列表，不阻断页面其余内容。
 */
export function JourneyMapSection({ page }: JourneyMapSectionProps) {
  const data = useMemo(() => buildJourneyData(page), [page]);
  const clusterMarkers = useMemo(
    () => buildJourneyClusterMarkers(data.markers),
    [data.markers],
  );
  const { ref, inView } = useInViewport();
  const [status, setStatus] = useState<MapPanelStatus>("waiting");

  if (data.markers.length === 0) {
    return null;
  }

  const degraded = status === "failed" || status === "degraded";

  return (
    <section
      ref={ref}
      aria-labelledby="journey-map-heading"
      className="mt-16 border-t border-line pt-12"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="journey-map-heading" className="font-serif text-h1 text-ink">
          足迹地图
        </h2>
        <p className="text-caption text-muted">{data.summary}</p>
      </div>
      <p className="mt-2 text-caption text-muted">
        地图瓦片来自 OpenStreetMap；仅显示作者公开的地点。
      </p>

      {degraded ? (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-caption text-muted">
              地图暂时不可用，已改为按展览分组的位置列表。
            </p>
            <Button variant="ghost" size="sm" onClick={() => setStatus("waiting")}>
              重试加载地图
            </Button>
          </div>
          <div className="mt-4">
            <JourneyLocationList groups={data.groups} />
          </div>
        </div>
      ) : inView ? (
        <div className="mt-6">
          <ClusterMapView
            markers={clusterMarkers}
            ariaLabel="作者公开足迹地图"
            className="aspect-[21/9]"
            onLoadStateChange={setStatus}
            onTileError={() => setStatus("degraded")}
          />
          <p className="mt-3 text-micro text-muted">
            数字表示附近地点的数量；点击聚类放大地图，点击标记查看照片与展览入口。
          </p>
        </div>
      ) : (
        <ClusterMapPlaceholder className="mt-6 aspect-[21/9]" />
      )}
    </section>
  );
}
