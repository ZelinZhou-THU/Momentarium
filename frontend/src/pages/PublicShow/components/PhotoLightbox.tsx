import { useEffect, useRef } from "react";
import { PaletteStrip } from "../../../components/ui";
import { photoTransitionName } from "../../../motion/transitionNames";
import type { LightboxDirection, LightboxState } from "../objects/LightboxState";
import type { ShowStop } from "../objects/ShowStop";

export interface PhotoLightboxProps {
  readonly stops: readonly ShowStop[];
  /** 打开着的大图（当前站点 + 翻页方向）；null 表示未打开。 */
  readonly lightbox: LightboxState | null;
  readonly onClose: () => void;
  readonly onNavigate: (index: number) => void;
}

/** 翻页时新照片从翻页方向滑入；刚打开时不加动画，由缩略图补间放大。 */
const ENTER_ANIMATION: Readonly<Record<LightboxDirection, string>> = {
  none: "",
  forward: "animate-slide-from-right motion-reduce:animate-none",
  backward: "animate-slide-from-left motion-reduce:animate-none",
};

const NAV_BUTTON_CLASS =
  "shrink-0 rounded-md bg-surface/10 px-3 py-4 text-h2 text-surface transition-colors duration-150 ease-out hover:bg-surface/20 disabled:invisible motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/**
 * 公开页大图查看，同时是叙事导览：全屏深色 + 章节标签 + 主文字（作者图注 → AI 配文 → 章节叙事）
 * + AI 配文与感官描写 + 这张照片的主色，
 * 可按章节顺序上一张/下一张（按钮或 ←/→），Esc / 点击背景关闭。
 * 页面本地实现（不走 ui Dialog），因为公开页需要整屏大图且保持 night 沉浸色。
 * 打开/关闭的渐显渐隐由整页的 View Transition 完成，自身不再加渐显动画。
 */
export function PhotoLightbox({ stops, lightbox, onClose, onNavigate }: PhotoLightboxProps) {
  const activeIndex = lightbox?.index ?? null;
  const stop = activeIndex === null ? undefined : stops[activeIndex];
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isOpen = activeIndex !== null;

  // 打开时把焦点移到「关闭大图」，关闭时还给打开它的缩略图，键盘与读屏用户不会丢在背景页里。
  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    return () => opener?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (activeIndex === null) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && activeIndex > 0) onNavigate(activeIndex - 1);
      if (event.key === "ArrowRight" && activeIndex < stops.length - 1) onNavigate(activeIndex + 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, stops.length, onClose, onNavigate]);

  if (lightbox === null || activeIndex === null || stop === undefined) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={stop.photo.caption === "" ? (stop.eyebrow ?? "照片") : stop.photo.caption}
      className="fixed inset-0 z-50 flex flex-col bg-night"
    >
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <p className="text-caption text-surface/60">
          {activeIndex + 1} / {stops.length}
        </p>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="rounded-md bg-surface/10 px-4 py-2 text-caption text-surface transition-colors duration-150 ease-out hover:bg-surface/20 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          关闭大图
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center gap-4 px-4 pb-4 sm:px-8">
        <button
          type="button"
          aria-label="上一张"
          disabled={activeIndex === 0}
          onClick={() => onNavigate(activeIndex - 1)}
          className={NAV_BUTTON_CLASS}
        >
          ‹
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭大图"
          tabIndex={-1}
          className="flex h-full min-w-0 flex-1 items-center justify-center focus-visible:outline-none"
        >
          <img
            key={stop.photo.id}
            src={stop.photo.contentUrl}
            alt={stop.photo.caption}
            style={{ viewTransitionName: photoTransitionName(stop.photo.id) }}
            className={`max-h-full max-w-full rounded-md object-contain ${ENTER_ANIMATION[lightbox.direction]}`}
          />
        </button>
        <button
          type="button"
          aria-label="下一张"
          disabled={activeIndex === stops.length - 1}
          onClick={() => onNavigate(activeIndex + 1)}
          className={NAV_BUTTON_CLASS}
        >
          ›
        </button>
      </div>
      <div className="mx-auto w-full max-w-2xl px-6 pb-8 text-center">
        {stop.eyebrow === null ? null : (
          <p className="text-micro tracking-wide text-surface/60">{stop.eyebrow}</p>
        )}
        {stop.words === "" ? null : (
          <p key={stop.photo.id} className="mt-2 animate-fade-in font-serif text-h2 text-surface motion-reduce:animate-none">
            {stop.words}
          </p>
        )}
        {stop.echoes.map((echo) => (
          <p key={`${stop.photo.id}-${echo}`} className="mt-2 animate-fade-in font-serif text-caption text-surface/65 motion-reduce:animate-none">
            {echo}
          </p>
        ))}
        <div className="mt-4 flex justify-center">
          <PaletteStrip colors={stop.palette} label="这张照片的主色" swatchClassName="h-2 w-8 border border-surface/25" />
        </div>
        {/* v1.9：已发布快照冻结的已采用讲述；旧快照 memories=[] 时不显示这一块。 */}
        {stop.photo.memories.length === 0 ? null : (
          <div className="mt-6 flex flex-col gap-3 text-left">
            <p className="text-micro tracking-wide text-surface/60">来自共同投稿的讲述</p>
            {stop.photo.memories.map((memory, index) => (
              <figure key={`${stop.photo.id}-memory-${String(index)}`}>
                <blockquote className="font-serif text-caption text-surface/80">
                  “{memory.text}”
                </blockquote>
                <figcaption className="mt-1 text-micro text-surface/55">
                  — {memory.contributorName}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
