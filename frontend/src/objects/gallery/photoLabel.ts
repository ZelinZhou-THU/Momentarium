import type { PhotoView } from "./PhotoView";

/**
 * 照片在作者界面里的统一称呼：图注 → 原文件名。
 * 工作台各分区（照片、策展、地图、洞察）都用同一条回退规则，同一张照片在哪儿看到的名字都一样。
 */
export const photoLabel = (photo: Pick<PhotoView, "caption" | "originalName">): string =>
  photo.caption.trim().length > 0 ? photo.caption.trim() : photo.originalName;
