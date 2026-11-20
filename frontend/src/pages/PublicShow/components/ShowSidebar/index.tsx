import { useEffect, useMemo, useState } from "react";
import { classNames } from "../../../../components/ui/classNames";
import type { PublicExhibitionView } from "../../functions/publicShowDtos";
import { buildPublicMapLocations } from "../../functions/publicLocations";
import { ChapterList } from "./ChapterList";
import { LocationList } from "./LocationList";

export type SidebarMode = "chapters" | "map";

export interface ShowSidebarProps {
  readonly exhibition: PublicExhibitionView;
  readonly open: boolean;
  readonly lightboxOpen: boolean;
  /** 点击章节缩略图或地图标记：打开现有大图导览。 */
  readonly onOpenPhoto: (photoId: string) => void;
  /** 仅供测试：初始打开的模式（默认章节）。 */
  readonly defaultMode?: SidebarMode;
}

/**
 * 公开页右侧栏（章节 / 地图两种模式）：
 * - 章节：原章节与照片导航（大图打开时缩略图让出共享元素名）；
 * - 地图：只在快照里有公开位置时出现，否则不显示空地图；地图模式内可点击标记看大图、点选照片定位地图。
 * 侧栏常驻挂载、用位移 + 渐隐收放（收起时 inert，键盘和读屏都够不到）。
 */
export function ShowSidebar({
  exhibition,
  open,
  lightboxOpen,
  onOpenPhoto,
  defaultMode = "chapters",
}: ShowSidebarProps) {
  const mapLocations = useMemo(() => buildPublicMapLocations(exhibition), [exhibition]);
  const hasMap = mapLocations.length > 0;
  const [mode, setMode] = useState<SidebarMode>(() =>
    defaultMode === "map" && hasMap ? "map" : "chapters",
  );

  useEffect(() => {
    if (mode === "map" && !hasMap) {
      setMode("chapters");
    }
  }, [mode, hasMap]);

  const modeButtonClass = (active: boolean): string =>
    classNames(
      "rounded-md px-3 py-1 text-caption transition-colors duration-150 ease-out motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-night",
      active ? "bg-surface/15 text-surface" : "text-surface/70 hover:bg-surface/10 hover:text-surface",
    );

  return (
    <aside
      aria-label="章节与地图"
      aria-hidden={!open}
      inert={!open}
      className={`absolute inset-x-0 bottom-0 z-20 flex h-[45vh] w-full flex-col border-t border-surface/10 bg-night text-surface transition duration-250 ease-out motion-reduce:transition-none lg:inset-x-auto lg:right-0 lg:top-0 lg:h-auto lg:max-w-xs lg:border-l lg:border-t-0 lg:pt-16 ${
        open
          ? "translate-x-0 translate-y-0 opacity-100"
          : "translate-y-full opacity-0 lg:translate-x-full lg:translate-y-0"
      }`}
    >
      <div className="border-b border-surface/10 px-6 py-5">
        <div role="tablist" aria-label="侧栏内容" className="flex items-center gap-2">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "chapters"}
            onClick={() => setMode("chapters")}
            className={modeButtonClass(mode === "chapters")}
          >
            章节
          </button>
          {hasMap ? (
            <button
              type="button"
              role="tab"
              aria-selected={mode === "map"}
              onClick={() => setMode("map")}
              className={modeButtonClass(mode === "map")}
            >
              地图 · {mapLocations.length}
            </button>
          ) : null}
        </div>

        {mode === "chapters" ? (
          <>
            <p className="mt-3 text-micro tracking-wide text-surface/60">
              共 {exhibition.groups.length} 章 · 点击照片查看大图与图注
            </p>
            {exhibition.narrative.trim() === "" ? null : (
              <p className="mt-3 line-clamp-4 font-serif text-caption text-surface/85">
                {exhibition.narrative}
              </p>
            )}
          </>
        ) : (
          <p className="mt-3 text-micro tracking-wide text-surface/60">
            已发布的公开地点 · 共 {mapLocations.length} 处
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {mode === "chapters" ? (
          <ChapterList
            groups={exhibition.groups}
            shareTransitionNames={open && !lightboxOpen}
            onOpenPhoto={onOpenPhoto}
          />
        ) : (
          <LocationList locations={mapLocations} onOpenPhoto={onOpenPhoto} />
        )}
      </div>
    </aside>
  );
}
