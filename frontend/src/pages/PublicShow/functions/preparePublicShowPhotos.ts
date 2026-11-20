import { DISPLAY_JPEG_QUALITY } from "../../../scene/contract";
import { computeDisplaySize } from "../../../scene/functions/computeDisplaySize";
import type { SandboxPhotoTransfer } from "../../../scene/contract";
import type { PublicPhotoView } from "../../../objects/gallery/PublicExhibitionView";

/**
 * 公开页展示图准备（spec §9.4）：公开照片路由不带令牌直接取字节，
 * 客户端 canvas 降采样到长边 ≤2048 / JPEG 0.82 后传给沙箱（原图不进沙箱）。
 * 与工作台走同一套尺寸规则（复用 scene 的纯函数 computeDisplaySize，只读引用）。
 */
const canvasToJpegBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("canvas.toBlob() 返回空结果"));
        }
      },
      "image/jpeg",
      DISPLAY_JPEG_QUALITY,
    );
  });

export const preparePublicShowPhoto = async (
  photo: PublicPhotoView,
  signal?: AbortSignal,
): Promise<SandboxPhotoTransfer> => {
  const response = await fetch(photo.contentUrl, signal === undefined ? {} : { signal });
  if (!response.ok) {
    throw new Error(`照片加载失败：HTTP ${response.status}`);
  }
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const size = computeDisplaySize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("当前浏览器不可用 canvas 2d 上下文，无法准备展示图");
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const jpeg = await canvasToJpegBlob(canvas);
    return {
      id: photo.id,
      width: size.width,
      height: size.height,
      aspect: size.width / size.height,
      mimeType: "image/jpeg",
      buffer: await jpeg.arrayBuffer(),
    };
  } finally {
    bitmap.close();
  }
};

/** 按 exhibition.photos 顺序准备全部展示图（顺序即沙箱 ctx.photos 顺序）。 */
export const preparePublicShowPhotos = (
  photos: readonly PublicPhotoView[],
  signal?: AbortSignal,
): Promise<readonly SandboxPhotoTransfer[]> =>
  Promise.all(photos.map((photo) => preparePublicShowPhoto(photo, signal)));
