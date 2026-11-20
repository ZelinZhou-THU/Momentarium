import type { SandboxPhotoTransfer } from "../../../scene/contract";
import type { PublicExhibitionView } from "../../../objects/gallery/PublicExhibitionView";
import type { PublishedSceneResponse } from "../../../objects/gallery/PublishedSceneResponse";

/** 已在 3D 中可游览的公开场景（getpublishedscene 工件 + 展示图字节）。 */
export interface PublicPlayingScene {
  readonly scene: PublishedSceneResponse;
  /** 按 exhibition.photos 顺序准备的展示图（沙箱 ctx.photos）。 */
  readonly photos: readonly SandboxPhotoTransfer[];
}

/**
 * 公开页状态机（spec §11.2 PublicShow：先导页 → 沙箱）：
 * loading（拉 public exhibition）→ notfound / error / ready（先导页）
 * → entering（拉 published scene + 准备照片）→ ready（playing 非空，3D 游览）。
 */
export type PublicShowState =
  | { readonly status: "loading" }
  | { readonly status: "notfound" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "entering"; readonly exhibition: PublicExhibitionView }
  | {
      readonly status: "ready";
      readonly exhibition: PublicExhibitionView;
      readonly playing: PublicPlayingScene | null;
    };
