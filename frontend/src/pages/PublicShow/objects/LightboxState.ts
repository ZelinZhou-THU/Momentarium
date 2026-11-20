/** 上一次翻页的方向：决定新照片从哪一侧滑入；刚打开大图时为 none（由缩略图补间放大）。 */
export type LightboxDirection = "none" | "forward" | "backward";

/** 打开着的大图：当前导览站点下标 + 翻页方向；关闭时整体为 null。 */
export interface LightboxState {
  readonly index: number;
  readonly direction: LightboxDirection;
}

/** 打开大图（从侧栏缩略图或场景里的照片）；找不到站点时保持关闭。 */
export const openLightbox = (index: number | null): LightboxState | null =>
  index === null ? null : { index, direction: "none" };

/** 翻到另一站：方向由前后位置决定。 */
export const moveLightbox = (current: LightboxState, index: number): LightboxState => ({
  index,
  direction: index > current.index ? "forward" : index < current.index ? "backward" : current.direction,
});
