import { useState } from "react";
import { DeletePhotoAPI } from "../../../../apis/gallery/DeletePhotoAPI";
import { useAuthorizedImage } from "../../../../apis/shared/useAuthorizedImage";
import { Button, ConfirmDialog, PhotoCard, PhotoGrid } from "../../../../components/ui";
import type { ExhibitionDetail } from "../../../../objects/gallery/ExhibitionDetail";
import type { PhotoView } from "../../../../objects/gallery/PhotoView";
import { photoLabel } from "../../../../objects/gallery/photoLabel";
import { describeGalleryError } from "../../../../apis/gallery/describeGalleryError";
import { PhotoLightbox } from "./PhotoLightbox";

export interface PhotoTrayProps {
  readonly exhibition: ExhibitionDetail;
  readonly onChanged: () => void;
}

interface PhotoTileProps {
  readonly photo: PhotoView;
  readonly onDelete: () => void;
  readonly onView: () => void;
}

/** 单张照片：缩略图是作者态二进制路由，经 useAuthorizedImage 取 blob；加载中显示占位。 */
function PhotoTile({ photo, onDelete, onView }: PhotoTileProps) {
  const image = useAuthorizedImage(photo.thumbUrl);

  return (
    <div className="flex flex-col gap-2">
      {image.objectUrl === null ? (
        <div
          aria-hidden="true"
          className="aspect-square w-full rounded-xl bg-surface/10"
        />
      ) : (
        <button
          type="button"
          onClick={onView}
          className="rounded-xl text-left transition-opacity duration-150 ease-out hover:opacity-90 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-night"
        >
          <PhotoCard src={image.objectUrl} alt={photo.originalName} caption={photoLabel(photo)} tone="dark" />
        </button>
      )}
      <div className="flex items-center gap-1">
        <Button variant="inverse" size="sm" onClick={onView}>
          查看大图
        </Button>
        <Button variant="inverse" size="sm" onClick={onDelete}>
          删除
        </Button>
      </div>
    </div>
  );
}

/** 照片墙（深色底，照片更突出）：未分组托盘 + 各章节照片；每张都可删除（二次确认，成功/失败后刷新或提示）。 */
export function PhotoTray({ exhibition, onChanged }: PhotoTrayProps) {
  const [deleteTarget, setDeleteTarget] = useState<PhotoView | null>(null);
  const [viewTarget, setViewTarget] = useState<PhotoView | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalCount =
    exhibition.ungroupedPhotos.length +
    exhibition.groups.reduce((sum, group) => sum + group.photos.length, 0);

  const handleDelete = () => {
    if (deleteTarget === null) {
      return;
    }
    setIsDeleting(true);
    setError(null);
    new DeletePhotoAPI(deleteTarget.id).send().then(
      () => {
        setIsDeleting(false);
        setDeleteTarget(null);
        onChanged();
      },
      (deleteError: unknown) => {
        setIsDeleting(false);
        setDeleteTarget(null);
        setError(describeGalleryError(deleteError));
      },
    );
  };

  const renderPhoto = (photo: PhotoView) => (
    <PhotoTile
      key={photo.id}
      photo={photo}
      onView={() => setViewTarget(photo)}
      onDelete={() => setDeleteTarget(photo)}
    />
  );

  if (totalCount === 0) {
    return <p className="text-body text-muted">还没有照片。先上传一批，再开始整理章节与封面。</p>;
  }

  return (
    <div className="flex flex-col gap-8 rounded-xl bg-night p-6">
      {exhibition.ungroupedPhotos.length > 0 ? (
        <section>
          <h3 className="text-caption text-surface/60">
            未分组照片（{exhibition.ungroupedPhotos.length}）
          </h3>
          <div className="mt-3">
            <PhotoGrid columns={4}>{exhibition.ungroupedPhotos.map(renderPhoto)}</PhotoGrid>
          </div>
        </section>
      ) : null}

      {exhibition.groups.map((group) => (
        <section key={group.id}>
          <h3 className="text-caption text-surface/60">
            {group.title}（{group.photos.length}）
          </h3>
          <div className="mt-3">
            <PhotoGrid columns={4}>{group.photos.map(renderPhoto)}</PhotoGrid>
          </div>
        </section>
      ))}

      {error === null ? null : (
        <p role="alert" className="text-caption text-accentSoft">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除这张照片？"
        message={`「${deleteTarget === null ? "" : photoLabel(deleteTarget)}」删除后不可恢复；若已发布，会从公开快照中移除。`}
        confirmLabel="删除照片"
        tone="danger"
        loading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => {
          if (!isDeleting) {
            setDeleteTarget(null);
          }
        }}
      />

      <PhotoLightbox photo={viewTarget} onClose={() => setViewTarget(null)} />
    </div>
  );
}
