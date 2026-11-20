import { AuthorizedPhotoThumb } from "../../../../../components/AuthorizedPhotoThumb";
import { classNames } from "../../../../../components/ui/classNames";
import type { LocationRow } from "../functions/buildLocationRows";
import { countLocatedRows } from "../functions/buildLocationRows";
import { describeLocationStatus, describeLocationSummary } from "../functions/describeLocation";

export interface LocationPhotoListProps {
  readonly rows: readonly LocationRow[];
  readonly selectedPhotoId: string | null;
  readonly onSelect: (photoId: string) => void;
}

/**
 * 位置列表：展览全部照片按展示顺序排列，标出“未定位 / 推测位置 / 已确认 + 公开粒度”。
 * 这是地图之外始终可用的入口——地图未开启或不可用时，选照片与编辑位置都不受影响。
 */
export function LocationPhotoList({ rows, selectedPhotoId, onSelect }: LocationPhotoListProps) {
  return (
    <section className="min-w-0 rounded-xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-h2 text-ink">照片位置</h2>
        <p className="text-micro text-muted">已定位 {countLocatedRows(rows)} / {rows.length} 张</p>
      </div>
      <p className="mt-2 text-caption text-muted">
        选择一张照片，确认 EXIF 建议、搜索地点或在地图上选点。
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 text-caption text-muted">
          还没有照片。先到「照片」分区上传，再回来标记地点。
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {rows.map((row) => {
            const selected = row.photoId === selectedPhotoId;
            return (
              <li key={row.photoId}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(row.photoId)}
                  className={classNames(
                    "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors duration-150 ease-out motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                    selected
                      ? "border-accent bg-accentSoft"
                      : "border-line bg-bg hover:bg-accentSoft",
                  )}
                >
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-accentSoft">
                    <AuthorizedPhotoThumb url={row.thumbUrl} alt={row.label} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-caption text-ink">{row.label}</span>
                    <span className="mt-1 block truncate text-micro text-muted">
                      {describeLocationStatus(row.location)}
                    </span>
                    <span className="block truncate text-micro text-muted">
                      {describeLocationSummary(row.location)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
