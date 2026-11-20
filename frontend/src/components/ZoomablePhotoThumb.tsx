import { useState } from "react";
import { useAuthorizedImage } from "../apis/shared/useAuthorizedImage";
import { AuthorizedPhotoThumb } from "./AuthorizedPhotoThumb";
import { Dialog, Spinner } from "./ui";

export interface ZoomablePhotoThumbProps {
  /** 缩略图地址（作者态受保护路由）。 */
  readonly thumbUrl: string;
  /** 大图地址；点击缩略图后在对话框里加载。 */
  readonly fullUrl: string;
  readonly alt: string;
  /** 缩略图容器的尺寸类名（如 "h-24 w-24"）。 */
  readonly sizeClassName: string;
  /** 大图下方的说明文字（图注、投稿者等），可选。 */
  readonly caption?: string;
}

function ZoomedPhoto({ fullUrl, alt, caption }: Pick<ZoomablePhotoThumbProps, "fullUrl" | "alt" | "caption">) {
  const image = useAuthorizedImage(fullUrl);
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
          <img src={image.objectUrl} alt={alt} className="max-h-screen w-auto object-contain" />
        )}
      </div>
      {caption === undefined || caption.length === 0 ? null : (
        <figcaption className="mt-3 text-caption text-muted">{caption}</figcaption>
      )}
    </figure>
  );
}

/** 可点击放大的作者态缩略图：审阅、策展等需要看清照片内容的地方共用；点击后在对话框里看大图。 */
export function ZoomablePhotoThumb({
  thumbUrl,
  fullUrl,
  alt,
  sizeClassName,
  caption,
}: ZoomablePhotoThumbProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={`放大查看：${alt}`}
        onClick={() => setOpen(true)}
        className={`${sizeClassName} shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-line bg-accentSoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
      >
        <AuthorizedPhotoThumb url={thumbUrl} alt={alt} />
      </button>
      <Dialog open={open} title="查看大图" onClose={() => setOpen(false)}>
        {open ? <ZoomedPhoto fullUrl={fullUrl} alt={alt} caption={caption} /> : null}
      </Dialog>
    </>
  );
}
