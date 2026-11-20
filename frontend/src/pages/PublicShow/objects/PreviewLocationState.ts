/**
 * 跳转到看展预览时随 Location 携带的来源（spec：跳转携带走 useLocation）：
 * 决定先导页左上角返回到哪里；不带时返回工作台。
 */
export interface PreviewLocationState {
  readonly backTo: string;
  readonly backLabel: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** 收窄 location.state（来自历史记录，类型不可信）。 */
export const readPreviewLocationState = (state: unknown): PreviewLocationState | null =>
  isRecord(state) && typeof state.backTo === "string" && typeof state.backLabel === "string"
    ? { backTo: state.backTo, backLabel: state.backLabel }
    : null;
