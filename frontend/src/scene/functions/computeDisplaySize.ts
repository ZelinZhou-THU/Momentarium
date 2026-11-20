import { DISPLAY_MAX_EDGE } from "../contract";

export interface DisplayPhotoSize {
  readonly width: number;
  readonly height: number;
}

/** 长边不超过 DISPLAY_MAX_EDGE 的等比展示尺寸；非法尺寸直接抛错（调用方转错误态）。 */
export const computeDisplaySize = (sourceWidth: number, sourceHeight: number): DisplayPhotoSize => {
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
    throw new Error("照片尺寸必须为正数");
  }
  const scale = Math.min(1, DISPLAY_MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
};
