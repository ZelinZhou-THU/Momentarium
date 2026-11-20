/**
 * 沙箱展示图准备（spec §9.4）：父页面把照片字节解码后降采样到长边 ≤2048、JPEG 0.82，
 * 只把展示图传给沙箱；原图只用于大图查看，不进沙箱。
 *
 * 纯场景（D7）：场景不再陈列照片，生成代码不再使用 photos；沙箱仍向 ctx 提供 photos 以兼容旧场景代码，
 * 未使用照片不视为错误（运行时会话保留，只是 photoIdsUsed 为空）。
 *
 * 令牌逻辑统一走 apis/shared/authorizedFetch（web-lead 维护），这里不复制 token 读取。
 */
import { fetchAuthorizedBlob } from "../apis/shared/authorizedFetch";
import type { SandboxPhotoTransfer } from "./contract";
import { DISPLAY_JPEG_QUALITY } from "./contract";
import { computeDisplaySize } from "./functions/computeDisplaySize";

export type { DisplayPhotoSize } from "./functions/computeDisplaySize";
export { computeDisplaySize } from "./functions/computeDisplaySize";

/** 场景面板输入：展示图来源（照片 id + 带令牌的照片内容路由）。 */
export interface ScenePhotoSource {
  readonly id: string;
  readonly contentUrl: string;
}

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

/**
 * 取一张照片的展示图：带令牌 fetch → createImageBitmap → canvas 降采样 → JPEG 0.82。
 * 即使原图小于 2048 也重新编码：统一成 JPEG，并丢弃 EXIF/GPS 等元数据。
 */
export const prepareDisplayPhoto = async (
  photo: ScenePhotoSource,
  signal?: AbortSignal,
): Promise<SandboxPhotoTransfer> => {
  const blob = await fetchAuthorizedBlob(photo.contentUrl, signal);
  const bitmap = await createImageBitmap(blob);
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

/** 按 run.photoIds 的顺序准备全部展示图（保持顺序，避免章节/环绕顺序错乱）。 */
export const prepareDisplayPhotos = async (
  photos: readonly ScenePhotoSource[],
  signal?: AbortSignal,
): Promise<readonly SandboxPhotoTransfer[]> =>
  Promise.all(photos.map((photo) => prepareDisplayPhoto(photo, signal)));
