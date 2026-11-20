import { useEffect, useState } from "react";
import { GetPhotoInsightsAPI } from "../../../apis/curation/GetPhotoInsightsAPI";
import {
  buildCaptionSuggestions,
  NO_CAPTION_SUGGESTIONS,
} from "../functions/buildCaptionSuggestions";
import type { CaptionSuggestions } from "../functions/buildCaptionSuggestions";

/**
 * 读取记忆档案里已有的 AI 建议图注（只读缓存，不触发模型调用）。
 * 草稿变化（detail 刷新）后重读一次；读取失败按「没有建议」处理，不打断策展。
 */
export const useCaptionSuggestions = (exhibitionId: string, refreshKey: string): CaptionSuggestions => {
  const [suggestions, setSuggestions] = useState<CaptionSuggestions>(NO_CAPTION_SUGGESTIONS);

  useEffect(() => {
    // 接口不支持取消；用 AbortController 当「已过期」标记，丢弃过期响应。
    const controller = new AbortController();
    new GetPhotoInsightsAPI(exhibitionId).send().then(
      (insights) => {
        if (!controller.signal.aborted) {
          setSuggestions(buildCaptionSuggestions(insights));
        }
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [exhibitionId, refreshKey]);

  return suggestions;
};
