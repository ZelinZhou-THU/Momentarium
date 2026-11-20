import type { LocationGranularity } from "../../../../../objects/gallery/PhotoLocationView";
import type { PlaceCandidate } from "../../../../../objects/gallery/PlaceSearchResponse";
import type { PhotoLocationCandidate } from "../../../../../objects/curation/PhotoLocationCandidatesResponse";

/**
 * 地图分区的页面状态（判别联合）：
 * - 编辑草稿保留表单原始字符串（受控输入），保存前统一校验；
 * - 地点搜索按 idle/searching/results/empty/error 建模，0 结果不是错误；
 * - 保存按 idle/saving/failed 建模，失败不破坏已填草稿。
 */
export interface LocationDraft {
  readonly photoId: string;
  readonly name: string;
  readonly latitude: string;
  readonly longitude: string;
  readonly granularity: LocationGranularity;
}

export type LocationSearchState =
  | { readonly status: "idle" }
  | { readonly status: "searching" }
  | { readonly status: "results"; readonly candidates: readonly PlaceCandidate[] }
  | { readonly status: "empty" }
  | { readonly status: "error"; readonly message: string };

export type LocationSaveState =
  | { readonly status: "idle" }
  | { readonly status: "saving" }
  | { readonly status: "failed"; readonly message: string };

/**
 * AI 地点候选状态（v1.13）：
 * - 选中照片时只读取已存候选（origin=stored），不自动调用 AI；
 * - 点击「AI 识别地点」才生成（origin=suggested）；
 * - 候选未确认不进入地图/快照；空列表不是错误。
 */
export type LocationCandidateState =
  | { readonly status: "idle" }
  | { readonly status: "loading"; readonly origin: "stored" }
  | { readonly status: "generating" }
  | {
      readonly status: "ready";
      readonly origin: "stored" | "suggested";
      readonly candidates: readonly PhotoLocationCandidate[];
      readonly model: string | null;
      readonly generatedAt: string | null;
    }
  | { readonly status: "empty"; readonly origin: "stored" | "suggested" }
  | {
      readonly status: "failed";
      readonly origin: "stored" | "suggested";
      readonly message: string;
    };

export type CandidateConfirmState =
  | { readonly status: "idle" }
  | { readonly status: "confirming"; readonly candidateId: string }
  | { readonly status: "failed"; readonly message: string };

/** 地图加载状态（在组件边缘上报，供分区提示使用）。 */
export type MapAvailability = "closed" | "loading" | "ready" | "failed";

/** 地图分区的降级提示：始终不阻断列表与编辑。 */
export interface MapFallbackHint {
  readonly tone: "info" | "warning";
  readonly message: string;
}

/** 保存前校验的字段错误（null 表示该字段没有错误）。 */
export interface LocationDraftErrors {
  readonly name: string | null;
  readonly coordinates: string | null;
  readonly granularity: string | null;
}
