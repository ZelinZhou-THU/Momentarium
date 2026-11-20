import { useAuthorizedImage } from "../apis/shared/useAuthorizedImage";

export interface AuthorizedPhotoThumbProps {
  readonly url: string;
  readonly alt: string;
  readonly className?: string;
}

/**
 * 照片缩略图（作者态）：带 Bearer 取 blob 后渲染；加载中/失败显示 accentSoft 占位。
 * 尺寸由调用方 className 控制（工作台与照片记忆档案共用）。
 */
export function AuthorizedPhotoThumb({ url, alt, className }: AuthorizedPhotoThumbProps) {
  const image = useAuthorizedImage(url);
  const classes = className ?? "h-full w-full";

  if (image.objectUrl === null) {
    return <div aria-hidden="true" className={`${classes} bg-accentSoft`} />;
  }

  return <img src={image.objectUrl} alt={alt} className={`${classes} object-cover`} />;
}
