import { Link } from "react-router-dom";
import type { JourneyGroup } from "../../functions/buildJourneyData";
import { journeyExhibitionPath, journeyThumbUrl } from "../../functions/buildJourneyData";

export interface JourneyLocationListProps {
  readonly groups: readonly JourneyGroup[];
}

/**
 * 足迹地图的降级列表：瓦片/地图库不可用时按展览分组展示公开地点（缩略图 + 地点名 + 展览入口），
 * 不改动页面其余内容，也不把地图失败当整页错误。
 */
export function JourneyLocationList({ groups }: JourneyLocationListProps) {
  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.exhibitionId} className="rounded-xl border border-line bg-surface p-6">
          <h3 className="font-serif text-h2 text-ink">
            <Link
              viewTransition
              to={journeyExhibitionPath(group.exhibitionId)}
              className="underline-offset-4 transition-colors duration-150 ease-out hover:text-accent hover:underline motion-reduce:transition-none"
            >
              {group.exhibitionTitle}
            </Link>
          </h3>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.locations.map((location) => (
              <li
                key={location.id}
                className="flex items-center gap-3 rounded-md border border-line bg-bg px-3 py-2"
              >
                <img
                  src={journeyThumbUrl(location.photoId)}
                  alt={location.name}
                  loading="lazy"
                  className="h-12 w-12 shrink-0 rounded-md border border-line object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate text-caption text-ink">
                    {location.name.trim() === "" ? "未命名地点" : location.name}
                  </p>
                  <Link
                    viewTransition
                    to={journeyExhibitionPath(location.exhibitionId)}
                    className="text-micro text-accent underline-offset-4 hover:underline"
                  >
                    查看展览
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
