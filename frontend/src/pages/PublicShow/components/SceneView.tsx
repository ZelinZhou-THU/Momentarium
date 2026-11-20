import { useMemo, useState } from "react";
import { withViewTransition } from "../../../motion/viewTransition";
import { SceneSandbox } from "../../../scene/sandbox";
import type { PublicExhibitionView } from "../functions/publicShowDtos";
import { moveLightbox, openLightbox } from "../objects/LightboxState";
import type { LightboxState } from "../objects/LightboxState";
import type { PublicPlayingScene } from "../objects/PublicShowState";
import type { ShowPresentation } from "../objects/ShowPresentation";
import { buildShowStops, findStopIndex } from "../functions/buildShowStops";
import { buildPublicMapLocations } from "../functions/publicLocations";
import { describePublicSceneFailure } from "../functions/describePublicSceneFailure";
import { useOpeningHold } from "../hooks/useOpeningHold";
import { OpeningCurtain } from "./OpeningCurtain";
import { PhotoLightbox } from "./PhotoLightbox";
import { ShowSidebar } from "./ShowSidebar";

/** 开场字幕至少停留的毫秒数。 */
const OPENING_HOLD_MS = 3000;

/** 窄屏（<lg）默认收起章节，避免盖住 3D 主体；没有 window（服务端渲染）时按桌面处理。 */
const isCompactViewport = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;

export interface SceneViewProps {
  readonly exhibition: PublicExhibitionView;
  readonly playing: PublicPlayingScene;
  readonly presentation: ShowPresentation;
  readonly onExit: () => void;
}

/**
 * 全屏只读 3D 游览（spec §9.7）：复用 scene/ 的 SceneSandbox（不自动截图、会话不设上限），
 * 章节侧栏打开时场景让出对应区域（不被遮挡，场景随画布尺寸重新取景）；覆盖层只保留退出/标题/版本；开场字幕盖住场景搭建的等待；
 * 照片点击回传 photoId 后弹大图与图注，大图可按叙事顺序前后翻看；
 * 打开/关闭大图走 View Transition（缩略图与大图互相补间）。
 * 渲染失败（WebGL 不可用/构建超时等）给出可重试遮罩，不静默黑屏。
 */
export function SceneView({ exhibition, playing, presentation, onExit }: SceneViewProps) {
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => !isCompactViewport());
  const [failure, setFailure] = useState<string | null>(null);
  const [built, setBuilt] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const holdElapsed = useOpeningHold(OPENING_HOLD_MS);
  const stops = useMemo(() => buildShowStops(exhibition), [exhibition]);
  // 有公开位置时侧栏才有「地图」模式；没有时保持单一「章节」入口（不显示空地图）。
  const hasPublicLocations = useMemo(
    () => buildPublicMapLocations(exhibition).length > 0,
    [exhibition],
  );

  const showStop = (index: number | null): void => withViewTransition(() => setLightbox(openLightbox(index)));
  const closeLightbox = (): void => withViewTransition(() => setLightbox(null));
  const turnTo = (index: number): void =>
    setLightbox((current) => (current === null ? null : moveLightbox(current, index)));

  const retry = (): void => {
    setFailure(null);
    setBuilt(false);
    setAttempt((value) => value + 1);
  };

  return (
    <div className="fixed inset-0 bg-night">
      <div
        className={`absolute inset-0 transition-all duration-250 ease-out motion-reduce:transition-none ${
          sidebarOpen ? "bottom-[45vh] lg:bottom-0 lg:right-[20rem]" : ""
        }`}
      >
        {failure === null ? (
          <SceneSandbox
            key={attempt}
            code={playing.scene.code}
            photos={playing.photos}
            runId={`public-${exhibition.id}-v${exhibition.version}-${attempt}`}
            sessionLimitMs={null}
            className="h-full w-full"
            onBuilt={() => setBuilt(true)}
            onPhotoSelected={(photoId) => showStop(findStopIndex(stops, photoId))}
            onFailure={(sceneFailure) => setFailure(describePublicSceneFailure(sceneFailure.code))}
          />
        ) : null}
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-4 bg-gradient-to-b from-night/85 to-transparent px-6 py-5">
        <div className="pointer-events-auto flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onExit}
            className="shrink-0 rounded-md bg-surface/10 px-4 py-2 text-caption text-surface transition-colors duration-150 ease-out hover:bg-surface/20 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            ← 退出场景
          </button>
          <p className="min-w-0 truncate font-serif text-caption text-surface/85">{exhibition.title}</p>
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-3">
          <p className="text-micro text-surface/60">{presentation.sceneBadge}</p>
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-expanded={sidebarOpen}
            className="rounded-md bg-surface/10 px-4 py-2 text-caption text-surface transition-colors duration-150 ease-out hover:bg-surface/20 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {sidebarOpen ? "收起侧栏" : hasPublicLocations ? "章节 / 地图" : "章节"}
          </button>
        </div>
      </header>

      <ShowSidebar
        exhibition={exhibition}
        open={sidebarOpen}
        lightboxOpen={lightbox !== null}
        onOpenPhoto={(photoId) => showStop(findStopIndex(stops, photoId))}
      />

      {failure === null ? (
        <OpeningCurtain
          title={exhibition.title}
          narration={exhibition.narration}
          badge={presentation.sceneBadge}
          built={built}
          lifted={built && holdElapsed}
        />
      ) : null}

      {failure !== null ? (
        <div className="absolute inset-0 flex items-center justify-center bg-night px-8">
          <div className="w-full max-w-md text-center">
            <h2 className="font-serif text-h2 text-surface">场景无法显示</h2>
            <p className="mt-3 text-body text-surface/75">{failure}</p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={retry}
                className="rounded-md bg-accentSoft px-4 py-2 text-caption text-night transition-colors duration-150 ease-out hover:opacity-90 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                重试
              </button>
              <button
                type="button"
                onClick={onExit}
                className="rounded-md bg-surface/10 px-4 py-2 text-caption text-surface transition-colors duration-150 ease-out hover:bg-surface/20 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                回到先导页
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <PhotoLightbox stops={stops} lightbox={lightbox} onClose={closeLightbox} onNavigate={turnTo} />
    </div>
  );
}
