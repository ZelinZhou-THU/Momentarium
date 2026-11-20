import { Link } from "react-router-dom";
import { Button } from "../../../components/ui";
import type { PublicExhibitionView } from "../functions/publicShowDtos";
import type { ShowPresentation } from "../objects/ShowPresentation";

export interface IntroGateProps {
  readonly exhibition: PublicExhibitionView;
  readonly presentation: ShowPresentation;
  readonly isEntering: boolean;
  readonly onEnter: () => void;
}

/**
 * 先导页（spec §11.2 IntroGate）：封面、标题、叙事、入口导语与「进入记忆」。
 * 只读展示，无编辑入口；公开页与作者看展预览共用，差别只在 presentation 外框文案。
 * 进入场景时整页向前推进（见 withViewTransition 的 scene-enter），退出时反向。
 */
export function IntroGate({ exhibition, presentation, isEntering, onEnter }: IntroGateProps) {
  return (
    <main className="relative min-h-screen bg-night text-surface">
      {presentation.backLink === null ? null : (
        <Link
          viewTransition
          to={presentation.backLink.to}
          className="absolute left-8 top-6 rounded-md bg-surface/10 px-4 py-2 text-caption text-surface transition-colors duration-150 ease-out hover:bg-surface/20 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {presentation.backLink.label}
        </Link>
      )}
      <div className="mx-auto grid min-h-screen w-full max-w-content items-center gap-12 px-8 py-16 lg:grid-cols-[1.1fr_1fr]">
        <figure className="overflow-hidden rounded-xl border border-surface/10 bg-ink">
          <div className="aspect-video w-full">
            <img
              src={exhibition.cover.imageUrl}
              alt={`${exhibition.title} 封面`}
              className="h-full w-full object-cover"
            />
          </div>
        </figure>

        <section>
          <p className="text-micro tracking-wide text-surface/60">{presentation.eyebrow}</p>
          <h1 className="mt-4 line-clamp-3 font-serif text-display text-surface">{exhibition.title}</h1>
          {exhibition.author === null ? null : (
            <Link
              viewTransition
              to={`/u/${exhibition.author.username}`}
              className="mt-3 inline-block text-caption text-surface/75 underline-offset-4 transition-colors duration-150 ease-out hover:text-surface hover:underline motion-reduce:transition-none"
            >
              作者 · {exhibition.author.displayName}
            </Link>
          )}
          <p className="mt-6 line-clamp-5 text-body text-surface/75">{exhibition.narrative}</p>
          <blockquote className="mt-6 border-l-2 border-accent pl-4 font-serif text-body text-surface">
            {exhibition.narration}
          </blockquote>
          <p className="mt-6 text-caption text-surface/65">
            {presentation.versionLabel}
          </p>
          {presentation.notice === null ? null : (
            <p className="mt-2 text-caption text-accentSoft">{presentation.notice}</p>
          )}
          <Button variant="inversePrimary" onClick={onEnter} loading={isEntering} className="mt-8">
            进入记忆
          </Button>
          {isEntering ? (
            <p role="status" className="mt-3 text-caption text-surface/75">
              正在准备场景与照片，首次进入约需几秒…
            </p>
          ) : null}
          <p className="mt-3 text-caption text-surface/65">
            进入后可拖动旋转、滚轮缩放；场景为记忆意境，章节照片与图注在章节侧栏查看大图，左上角可退出回到本页。
          </p>
        </section>
      </div>
    </main>
  );
}
