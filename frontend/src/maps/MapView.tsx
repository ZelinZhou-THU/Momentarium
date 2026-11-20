import { useEffect, useRef, useState } from "react";
import { Button } from "../components/ui";
import { classNames } from "../components/ui/classNames";
import type { GeoPoint } from "../objects/gallery/GeoPoint";
import { importLeaflet, MAP_LOAD_FAILED_MESSAGE, resolveLeaflet } from "./leaflet";
import type { LeafletLoader } from "./leaflet";
import { createMapSession, readMapColors } from "./mapSession";
import type { MapMarker, MapSession } from "./mapSession";
import { readMapTileConfig } from "./tileConfig";
import type { MapTileConfig } from "./tileConfig";

export type MapLoadState = "loading" | "ready" | "failed";

export interface MapViewProps {
  readonly markers: readonly MapMarker[];
  readonly selectedMarkerId: string | null;
  readonly onSelectMarker: (markerId: string) => void;
  /** 地图空白处点击（作者落点用）；公开只读地图不传。 */
  readonly onPickPoint?: (point: GeoPoint) => void;
  readonly ariaLabel: string;
  readonly className?: string;
  /** 测试/替换用加载器；默认按需动态 import leaflet（含 leaflet.css）。 */
  readonly loader?: LeafletLoader;
  /** 覆盖瓦片配置；默认读构建环境变量（OSM + 署名）。 */
  readonly tileConfig?: MapTileConfig;
  /** 地图加载状态（供外层做离线降级提示）；只上报，不参与渲染。 */
  readonly onLoadStateChange?: (state: MapLoadState) => void;
}

/**
 * Leaflet 地图的 React 边缘封装：业务状态（照片列表、选中项、编辑表单）都留在 React，
 * 这里只负责在挂载时按需加载地图库、创建实例、同步标记与销毁；地图库加载失败或瓦片不可用时
 * 显示可重试的失败提示，页面其他区域（位置列表与编辑）不受影响。
 * 地图高度由 aspect 比例给出，不写自定义 CSS；容器 isolate 把 Leaflet 内部层级限制在容器内。
 */
export function MapView({
  markers,
  selectedMarkerId,
  onSelectMarker,
  onPickPoint,
  ariaLabel,
  className,
  loader = importLeaflet,
  tileConfig,
  onLoadStateChange,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<MapSession | null>(null);
  const callbacksRef = useRef({ onSelectMarker, onPickPoint });
  const loaderRef = useRef(loader);
  const tileConfigRef = useRef(tileConfig);
  const loadStateChangeRef = useRef(onLoadStateChange);
  // 首次同步标记时由地图自动取景；只有之后选中项变化才平移，避免打开地图就跳到单点。
  const focusedMarkerRef = useRef<string | null>(selectedMarkerId);
  const [status, setStatus] = useState<MapLoadState>("loading");
  const [tileFailed, setTileFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    callbacksRef.current = { onSelectMarker, onPickPoint };
    loaderRef.current = loader;
    tileConfigRef.current = tileConfig;
    loadStateChangeRef.current = onLoadStateChange;
  }, [onSelectMarker, onPickPoint, loader, tileConfig, onLoadStateChange]);

  useEffect(() => {
    let cancelled = false;
    sessionRef.current?.destroy();
    sessionRef.current = null;
    setStatus("loading");
    setTileFailed(false);
    loadStateChangeRef.current?.("loading");

    void resolveLeaflet(loaderRef.current).then((result) => {
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
      const session = createMapSession(
        result.leaflet,
        container,
        {
          onMarkerSelect: (markerId) => callbacksRef.current.onSelectMarker(markerId),
          onMapClick: (point) => callbacksRef.current.onPickPoint?.(point),
          onTileError: () => {
            if (!cancelled) {
              setTileFailed(true);
            }
          },
        },
        {
          tileConfig: tileConfigRef.current ?? readMapTileConfig(),
          colors: readMapColors(container),
        },
      );
      sessionRef.current = session;
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
      sessionRef.current?.syncMarkers(markers, selectedMarkerId);
    }
  }, [markers, selectedMarkerId, status]);

  useEffect(() => {
    if (status !== "ready" || selectedMarkerId === null) {
      return;
    }
    if (focusedMarkerRef.current === selectedMarkerId) {
      return;
    }
    focusedMarkerRef.current = selectedMarkerId;
    sessionRef.current?.focusMarker(selectedMarkerId);
  }, [selectedMarkerId, status]);

  return (
    <div
      className={classNames(
        "relative isolate aspect-video w-full overflow-hidden rounded-xl border border-line bg-accentSoft",
        className,
      )}
    >
      <div ref={containerRef} role="region" aria-label={ariaLabel} className="h-full w-full" />
      {status === "loading" ? (
        <p
          role="status"
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-accentSoft/90 text-caption text-muted"
        >
          正在加载在线地图…
        </p>
      ) : null}
      {status === "failed" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-accentSoft px-6 text-center">
          <p className="text-caption text-ink">{MAP_LOAD_FAILED_MESSAGE}</p>
          <Button variant="secondary" size="sm" onClick={() => setAttempt((value) => value + 1)}>
            重试加载地图
          </Button>
        </div>
      ) : null}
      {status === "ready" && tileFailed ? (
        <p
          role="status"
          className="pointer-events-none absolute inset-x-3 top-3 rounded-md bg-night/90 px-3 py-2 text-micro text-surface"
        >
          底图瓦片暂时不可用；位置列表与编辑不受影响。
        </p>
      ) : null}
    </div>
  );
}
