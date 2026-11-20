import { useAuthorizedImage } from "../../../../apis/shared/useAuthorizedImage";
import { Dialog, Spinner } from "../../../../components/ui";
import type { PhotoView } from "../../../../objects/gallery/PhotoView";
import { photoLabel } from "../../../../objects/gallery/photoLabel";

export interface PhotoLightboxProps {
  /** 要查看的照片；null 时遮罩关闭（Dialog 常驻，由 open 控制显隐）。 */
  readonly photo: PhotoView | null;
  readonly onClose: () => void;
}

/** 作者态大图查看：带 Bearer 拉原图 blob → objectURL；大图与图注在同一遮罩内展示。 */
function PhotoLightboxContent({ photo }: { readonly photo: PhotoView }) {
  const image = useAuthorizedImage(photo.contentUrl);

  return (
    <figure>
      <div className="flex min-h-32 items-center justify-center overflow-hidden rounded-xl border border-line bg-bg">
        {image.objectUrl === null ? (
          image.status === "error" ? (
            <p className="px-6 py-10 text-caption text-danger">大图加载失败，请关闭后重试。</p>
          ) : (
            <Spinner label="正在加载大图" />
          )
        ) : (
          <img src={image.objectUrl} alt={photo.originalName} className="max-h-screen w-auto object-contain" />
        )}
      </div>
      <figcaption className="mt-3 text-caption text-muted">
        {photoLabel(photo)} · {photo.mime} · {photo.width}×{photo.height}
      </figcaption>
    </figure>
  );
}

export function PhotoLightbox({ photo, onClose }: PhotoLightboxProps) {
  return (
    <Dialog
      open={photo !== null}
      title={photo === null ? "查看大图" : "查看大图与图注"}
      onClose={onClose}
    >
      {photo === null ? null : <PhotoLightboxContent photo={photo} />}
    </Dialog>
  );
}
