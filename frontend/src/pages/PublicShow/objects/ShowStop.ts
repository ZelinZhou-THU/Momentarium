import type { PublicPhotoView } from "../functions/publicShowDtos";

/**
 * 看展导览中的一站：一张照片 + 它在叙事里的位置 + 要展示的文字与颜色。
 * eyebrow 是章节标签（如“第 2 章 · 退潮的礁石”），不属于任何章节的照片为 null；
 * words 是主文字：作者图注 → AI 配文 → 章节叙事，都没有则为空串；
 * echoes 是主文字之外的 AI 配文与感官描写（去空、去重，按此顺序）；palette 是这张照片的主色。
 */
export interface ShowStop {
  readonly photo: PublicPhotoView;
  readonly eyebrow: string | null;
  readonly words: string;
  readonly echoes: readonly string[];
  readonly palette: readonly string[];
}
