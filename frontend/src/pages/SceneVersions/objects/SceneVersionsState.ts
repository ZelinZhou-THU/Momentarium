import type { SceneRunView } from "../../../objects/gallery/SceneRunView";
import type { SceneRunSummary } from "../../../objects/scene/SceneRunSummary";
import type { SandboxPhotoTransfer } from "../../../scene/contract";

/** 版本列表：loading / empty / ready / error（spec 11.3）。 */
export type VersionsListState =
  | { readonly status: "loading" }
  | { readonly status: "empty" }
  | { readonly status: "ready"; readonly runs: readonly SceneRunSummary[] }
  | { readonly status: "error"; readonly message: string };

/** 沙箱展示图：加载 / 就绪 / 不可预览（无照片或读取失败）。 */
export type PreviewPhotosState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly photos: readonly SandboxPhotoTransfer[] }
  | { readonly status: "unavailable"; readonly message: string };

/** 右栏预览：未选择 / 加载 / 就绪 / 错误。 */
export type VersionPreviewState =
  | { readonly status: "idle" }
  | { readonly status: "loading"; readonly runId: string }
  | { readonly status: "ready"; readonly run: SceneRunView }
  | { readonly status: "error"; readonly runId: string; readonly message: string };
