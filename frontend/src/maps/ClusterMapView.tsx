import { useEffect, useRef, useState } from "react";
import { Button } from "../components/ui";
import { classNames } from "../components/ui/classNames";
import { createClusterSession } from "./clusterSession";
import type { ClusterMapMarker, ClusterSession } from "./clusterSession";
import {
  CLUSTER_MAP_LOAD_FAILED_MESSAGE,
  importClusterLeaflet,
  resolveClusterLeaflet,
} from "./markerCluster";
import type { ClusterLoader } from "./markerCluster";
import { readMapTileConfig } from "./tileConfig";
import type { MapTileConfig } from "./tileConfig";

export type ClusterMapLoadState = "loading" | "ready" | "failed";

export interface ClusterMapViewProps {
  readonly markers: readonly ClusterMapMarker[];
  readonly ariaLabel: string;
  readonly className?: string;
  /** 测试/替换用加载器；默认按需动态 import leaflet + markercluster（含必要样式）。 */
  readonly loader?: ClusterLoader;
  /** 覆盖瓦片配置；默认读构建环境变量（OSM + 署名）。 */
  readonly tileConfig?: MapTileConfig;
  /** 加载状态（供页面决定是否降级为分组列表）。 */
  readonly onLoadStateChange?: (state: ClusterMapLoadState) => void;
  /** 瓦片请求失败（离线/提供方不可用）：页面据此降级为按展览分组的位置列表。 */
  readonly onTileError?: () => void;
}

/**
 * 聚类地图的 React 边缘封装（作者主页足迹）：业务状态（分组列表、降级）留在页面，
 * 这里只负责按需加载 Leaflet + markercluster、创建/同步/销毁地图。
 * 加载失败或瓦片不可用时给出明确提示，页面可退回按展览分组的位置列表，不阻断其余内容。
 */
export function ClusterMapView({
  markers,
  ariaLabel,
  className,
  loader = importClusterLeaflet,
  tileConfig,
  onLoadStateChange,
  onTileError,
}: ClusterMapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<ClusterSession | null>(null);
  const callbacksRef = useRef({ onTileError });
  const loaderRef = useRef(loader);
  const tileConfigRef = useRef(tileConfig);
  const loadStateChangeRef = useRef(onLoadStateChange);
  const [status, setStatus] = useState<ClusterMapLoadState>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    callbacksRef.current = { onTileError };
    loaderRef.current = loader;
    tileConfigRef.current = tileConfig;
    loadStateChangeRef.current = onLoadStateChange;
  }, [onTileError, loader, tileConfig, onLoadStateChange]);

  useEffect(() => {
    let cancelled = false;
    sessionRef.current?.destroy();
    sessionRef.current = null;
    setStatus("loading");
    loadStateChangeRef.current?.("loading");

    void resolveClusterLeaflet(loaderRef.current).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.status === "failed") {
        setStatus("failed");
        loadStateChangeRef.current?.("failed");
        return;
      }
      const container = containerRef.current;
      if (container === null) {
        setStatus("failed");
        loadStateChangeRef.current?.("failed");
        return;
      }
      sessionRef.current = createClusterSession(
        result.leaflet,
        container,
        {
          onTileError: () => callbacksRef.current.onTileError?.(),
        },
        {
          tileConfig: tileConfigRef.current ?? readMapTileConfig(),
        },
      );
      setStatus("ready");
      loadStateChangeRef.current?.("ready");
    });

    return () => {
      cancelled = true;
      sessionRef.current?.destroy();
      sessionRef.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    if (status === "ready") {
      sessionRef.current?.syncMarkers(markers);
    }
  }, [markers, status]);

  return (
    <div
      className={classNames(
        "relative isolate w-full overflow-hidden rounded-xl border border-line bg-accentSoft",
        className,
      )}
    >
      <div
        ref={containerRef}
        role="region"
        aria-label={ariaLabel}
        className="h-full w-full"
      />
      {status === "loading" ? (
        <p
          role="status"
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-accentSoft/90 text-caption text-muted"
        >
          正在加载足迹地图…
        </p>
      ) : null}
      {status === "failed" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-accentSoft px-6 text-center">
          <p className="text-caption text-ink">{CLUSTER_MAP_LOAD_FAILED_MESSAGE}</p>
          <Button variant="secondary" size="sm" onClick={() => setAttempt((value) => value + 1)}>
            重试加载地图
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** 空地图占位（延迟加载/尚未进入视口时保留高度，避免页面跳动）。 */
export function ClusterMapPlaceholder({ className }: { readonly className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={classNames(
        "relative isolate w-full overflow-hidden rounded-xl border border-line bg-accentSoft",
        className,
      )}
    />
  );
}
