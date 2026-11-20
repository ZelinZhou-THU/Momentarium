import { useState } from "react";
import { Button, Dialog } from "../../../../components/ui";
import type { PhotoView } from "../../../../objects/gallery/PhotoView";
import { photoLabel } from "../../../../objects/gallery/photoLabel";
import type { CurationDraftGroup } from "../../objects/CurationDraft";
import { AuthorizedPhotoThumb } from "../../../../components/AuthorizedPhotoThumb";

export interface UnassignedTrayProps {
  readonly photos: readonly PhotoView[];
  readonly groups: readonly CurationDraftGroup[];
  readonly onAssign: (photo: PhotoView, groupIndex: number) => void;
}

/** 未分组托盘锚点 id：章节目录跳转用。 */
export const UNASSIGNED_TRAY_ANCHOR_ID = "curation-unassigned";

/** 未分组照片托盘：保存前必须全部放入章节（否则 updatecuration 返回 PHOTO_UNGROUPED）。 */
export function UnassignedTray({ photos, groups, onAssign }: UnassignedTrayProps) {
  const [assignTarget, setAssignTarget] = useState<PhotoView | null>(null);

  if (photos.length === 0) {
    return null;
  }

  return (
    <section id={UNASSIGNED_TRAY_ANCHOR_ID} className="mt-8 scroll-mt-24 border-t border-line pt-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-caption text-muted">未分组照片（{photos.length}）</h3>
        <p className="text-caption text-muted">保存前所有照片都要放入章节。</p>
      </header>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {photos.map((photo) => (
          <div key={photo.id} className="flex flex-col gap-2">
            <div className="aspect-square overflow-hidden rounded-xl border border-line bg-accentSoft">
              <AuthorizedPhotoThumb
                url={photo.thumbUrl}
                alt={photo.originalName}
                className="h-full w-full"
              />
            </div>
            <p className="truncate text-caption text-muted">{photoLabel(photo)}</p>
            <Button
              variant="secondary"
              size="sm"
              disabled={groups.length === 0}
              onClick={() => setAssignTarget(photo)}
            >
              放入章节
            </Button>
          </div>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="mt-3 text-caption text-muted">先在上方新建一个章节，再把照片放进去。</p>
      ) : null}

      <Dialog
        open={assignTarget !== null}
        title="放入哪个章节？"
        onClose={() => setAssignTarget(null)}
        footer={
          <Button variant="secondary" size="sm" onClick={() => setAssignTarget(null)}>
            取消
          </Button>
        }
      >
        <div className="flex flex-col items-start gap-2">
          {groups.map((group, groupIndex) => (
            <Button
              key={`assign-${groupIndex}`}
              variant="secondary"
              size="sm"
              onClick={() => {
                if (assignTarget !== null) {
                  onAssign(assignTarget, groupIndex);
                }
                setAssignTarget(null);
              }}
            >
              {group.title.length === 0 ? `章节 ${groupIndex + 1}` : group.title}
            </Button>
          ))}
        </div>
      </Dialog>
    </section>
  );
}
