import { PaletteStrip } from "../../../../components/ui";
import { photoTransitionName } from "../../../../motion/transitionNames";
import { staggerDelay } from "../../../../motion/stagger";
import { photoLineOf } from "../../functions/buildShowStops";
import type { PublicGroupView } from "../../functions/publicShowDtos";

export interface ChapterListProps {
  readonly groups: readonly PublicGroupView[];
  /** 侧栏展开且大图关闭时才给缩略图共享元素名（同名元素同一时刻只能有一个）。 */
  readonly shareTransitionNames: boolean;
  readonly onOpenPhoto: (photoId: string) => void;
}

/**
 * 章节侧栏的章节/照片列表（只读）：每章标题与叙事、两列缩略图与主色/一行文字。
 * 各章逐项上浮进场；大图关闭时缩略图带共享元素名，打开大图时由缩略图放大过去。
 */
export function ChapterList({ groups, shareTransitionNames, onOpenPhoto }: ChapterListProps) {
  const sharesPhotos = shareTransitionNames;
  return (
    <ol className="px-6 py-6">
      {groups.map((group, index) => (
        <li
          key={group.id}
          style={{ animationDelay: staggerDelay(index) }}
          className="mb-8 animate-rise-in last:mb-0 motion-reduce:animate-none"
        >
          <p className="text-micro tracking-wide text-accentSoft">第 {index + 1} 章</p>
          <h3 className="mt-1 font-serif text-h2 text-surface">{group.title}</h3>
          {group.narrative.length > 0 ? (
            <p className="mt-2 font-serif text-caption text-surface/70">{group.narrative}</p>
          ) : null}
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
            {group.photos.map((photo, photoIndex) => (
              <li key={photo.id}>
                <button
                  type="button"
                  onClick={() => onOpenPhoto(photo.id)}
                  aria-label={
                    photoLineOf(photo) === ""
                      ? `${group.title}的第 ${photoIndex + 1} 张照片`
                      : undefined
                  }
                  className="group block w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-night"
                >
                  <img
                    src={photo.thumbUrl}
                    alt={photo.caption}
                    style={{
                      viewTransitionName: sharesPhotos ? photoTransitionName(photo.id) : undefined,
                    }}
                    className="aspect-[4/3] w-full rounded-md border border-surface/10 object-cover transition-colors duration-150 ease-out group-hover:border-surface/40 motion-reduce:transition-none"
                  />
                  <span className="mt-2 block">
                    <PaletteStrip
                      colors={photo.reading?.palette ?? []}
                      label="这张照片的主色"
                      swatchClassName="h-2 w-4 border border-surface/25"
                    />
                  </span>
                  {photoLineOf(photo) === "" ? null : (
                    <span className="mt-1 line-clamp-2 block font-serif text-micro text-surface/75">
                      {photoLineOf(photo)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
