import { useState } from "react";
import { SetCoverAPI } from "../../../../apis/gallery/SetCoverAPI";
import { useAuthorizedImage } from "../../../../apis/shared/useAuthorizedImage";
import { Button, Dialog, PhotoCard, PhotoGrid } from "../../../../components/ui";
import type { CoverKind } from "../../../../objects/gallery/CoverView";
import type { ExhibitionDetail } from "../../../../objects/gallery/ExhibitionDetail";
import type { PhotoView } from "../../../../objects/gallery/PhotoView";
import { collectPhotos } from "../../functions/collectPhotos";
import { describeGalleryError } from "../../../../apis/gallery/describeGalleryError";

export interface CoverPickerProps {
  readonly exhibition: ExhibitionDetail;
  readonly onChanged: () => void;
}

interface CoverOptionProps {
  readonly photo: PhotoView;
  readonly onPick: () => void;
}

/** 封面候选照片：缩略图需带 Bearer 令牌取 blob，就绪后再交给可选中的 PhotoCard。 */
function CoverOption({ photo, onPick }: CoverOptionProps) {
  const image = useAuthorizedImage(photo.thumbUrl);

  if (image.objectUrl === null) {
    return (
      <div
        aria-hidden="true"
        className="aspect-square w-full rounded-xl border border-line bg-accentSoft"
      />
    );
  }

  return <PhotoCard src={image.objectUrl} alt={photo.originalName} onSelect={onPick} />;
}

/**
 * 封面选择：预览当前封面，支持 auto（第一章第一张）与 photo（指定一张照片）。
 * 封面是作者态二进制路由，经 useAuthorizedImage 取 blob；成功后递增本地 revision 触发重新取图。
 * 场景截图封面在场景区域设置。
 */
export function CoverPicker({ exhibition, onChanged }: CoverPickerProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverRevision, setCoverRevision] = useState(0);

  const photos = collectPhotos(exhibition);
  // 没有照片时 auto 封面没有可解析的图，后端会 404；直接跳过请求，避免无意义的控制台报错。
  const coverUrl =
    photos.length === 0 || exhibition.cover.imageUrl.length === 0
      ? ""
      : `${exhibition.cover.imageUrl}?v=${encodeURIComponent(exhibition.updatedAt)}-${coverRevision}`;
  const coverImage = useAuthorizedImage(coverUrl);

  const applyCover = (kind: CoverKind, photoId: string | null) => {
    setIsSubmitting(true);
    setError(null);
    new SetCoverAPI(exhibition.id, kind, photoId).send().then(
      () => {
        setIsSubmitting(false);
        setIsPickerOpen(false);
        setCoverRevision((revision) => revision + 1);
        onChanged();
      },
      (coverError: unknown) => {
        setIsSubmitting(false);
        setError(describeGalleryError(coverError));
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-caption text-muted">封面</h3>
      <div className="aspect-video w-full max-w-xs overflow-hidden rounded-md border border-line bg-accentSoft">
        {coverImage.objectUrl === null ? (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-micro text-muted">暂无封面</span>
          </div>
        ) : (
          <img src={coverImage.objectUrl} alt="展览封面" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          loading={isSubmitting}
          onClick={() => applyCover("auto", null)}
        >
          自动封面
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={isSubmitting || photos.length === 0}
          onClick={() => setIsPickerOpen(true)}
        >
          从照片选择
        </Button>
      </div>
      <p className="text-caption text-muted">
        自动封面取第一章第一张照片；也可以指定任意一张。也可以在场景区域将当前视角设为封面。
      </p>
      {error === null ? null : (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}

      <Dialog
        open={isPickerOpen}
        title="选择封面照片"
        onClose={() => {
          if (!isSubmitting) {
            setIsPickerOpen(false);
          }
        }}
        footer={
          <Button
            variant="secondary"
            size="sm"
            disabled={isSubmitting}
            onClick={() => setIsPickerOpen(false)}
          >
            取消
          </Button>
        }
      >
        {isPickerOpen ? <PhotoGrid columns={4}>
          {photos.map((photo) => (
            <CoverOption
              key={photo.id}
              photo={photo}
              onPick={() => applyCover("photo", photo.id)}
            />
          ))}
        </PhotoGrid> : null}
      </Dialog>
    </div>
  );
}
