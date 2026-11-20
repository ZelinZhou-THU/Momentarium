import { Link } from "react-router-dom";
import { PaletteStrip } from "../../../components/ui";
import type { AuthorExhibitionCard } from "../../../objects/gallery/AuthorPageView";
import { exhibitionThemeStyle } from "../../../theme/deriveExhibitionTheme";
import { staggerDelay } from "../../../motion/stagger";
import { formatPublishedDate } from "../functions/describeAuthorHome";

export interface AuthorExhibitionGridProps {
  readonly exhibitions: readonly AuthorExhibitionCard[];
}

/**
 * 已发布展览网格：封面（公开快照封面，匿名可读）+ 标题 + 入口导语 + 场景主色 + 发布日期，点击进入公开看展页；
 * 每张卡片套用该展览的局部配色。
 */
export function AuthorExhibitionGrid({ exhibitions }: AuthorExhibitionGridProps) {
  return (
    <ul className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
      {exhibitions.map((exhibition, index) => (
        <li
          key={exhibition.id}
          style={{ ...exhibitionThemeStyle(exhibition.scenePalette), animationDelay: staggerDelay(index) }}
          className="animate-rise-in motion-reduce:animate-none"
        >
          <Link
            viewTransition
            to={`/show/${exhibition.id}`}
            className="group block overflow-hidden rounded-xl border border-line bg-surface transition duration-200 ease-out hover:-translate-y-1 hover:shadow-sm motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <div className="aspect-video w-full overflow-hidden bg-accentSoft">
              <img src={exhibition.cover.imageUrl} alt={`${exhibition.title} 封面`} className="h-full w-full object-cover" />
            </div>
            <div className="p-4">
              <h2 className="font-serif text-h2 text-ink group-hover:text-accent">{exhibition.title}</h2>
              {exhibition.narration === "" ? null : (
                <p className="mt-2 line-clamp-2 text-caption text-muted">{exhibition.narration}</p>
              )}
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-micro text-muted">发布于 {formatPublishedDate(exhibition.publishedAt)}</p>
                <PaletteStrip colors={exhibition.scenePalette} label="场景主色" swatchClassName="h-2 w-5" />
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
