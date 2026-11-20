import type { ExhibitionDetail } from "../../../../objects/gallery/ExhibitionDetail";
import { CoverPicker } from "./CoverPicker";
import { PhotoTray } from "./PhotoTray";
import { UploadPhotos } from "./UploadPhotos";

export interface PhotoPanelProps {
  readonly exhibition: ExhibitionDetail;
  readonly onChanged: () => void;
}

/** PhotoPanel：上传 + 封面选择 + 照片墙（未分组托盘与各章节照片、逐张删除）。 */
export function PhotoPanel({ exhibition, onChanged }: PhotoPanelProps) {
  return (
    <section aria-labelledby="photo-panel-title" className="rounded-xl border border-line bg-surface p-6 shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="photo-panel-title" className="font-serif text-h2 text-ink">
          照片
        </h2>
        <p className="text-caption text-muted">
          上传与整理原始照片；封面也在这一区域选择。点击照片或「查看大图」可看原图与图注。
        </p>
      </header>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <UploadPhotos exhibitionId={exhibition.id} onUploaded={onChanged} />
        <CoverPicker exhibition={exhibition} onChanged={onChanged} />
      </div>

      <div className="mt-8">
        <PhotoTray exhibition={exhibition} onChanged={onChanged} />
      </div>
    </section>
  );
}
