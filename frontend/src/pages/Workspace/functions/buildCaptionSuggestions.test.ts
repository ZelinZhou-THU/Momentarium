import { describe, expect, it } from "vitest";
import type { PhotoInsightsResponse } from "../../../objects/curation/PhotoInsightsResponse";
import { buildCaptionSuggestions, captionSuggestionFor } from "./buildCaptionSuggestions";

const analysis = (photoId: string, suggestedCaption: string) => ({
  photoId,
  model: "m",
  analyzedAt: "2026-11-04T01:00:00Z",
  analysis: {
    description: "",
    mood: "",
    palette: [],
    memoryCues: [],
    sensory: "",
    suggestedCaption,
  },
});

const insights: PhotoInsightsResponse = {
  analyses: [analysis("p-1", " 退潮后的礁石 "), analysis("p-2", "   "), analysis("p-3", "雨停之后")],
  latestBrief: null,
};

describe("AI 建议图注", () => {
  it("只收非空建议（去首尾空白）", () => {
    const suggestions = buildCaptionSuggestions(insights);
    expect([...suggestions.entries()]).toEqual([
      ["p-1", "退潮后的礁石"],
      ["p-3", "雨停之后"],
    ]);
  });

  it("只对还没有图注的照片提供建议，不覆盖作者已写的图注", () => {
    const suggestions = buildCaptionSuggestions(insights);
    expect(captionSuggestionFor(suggestions, "p-1", "")).toBe("退潮后的礁石");
    expect(captionSuggestionFor(suggestions, "p-1", "  ")).toBe("退潮后的礁石");
    expect(captionSuggestionFor(suggestions, "p-1", "我自己写的")).toBeNull();
    expect(captionSuggestionFor(suggestions, "p-2", "")).toBeNull();
    expect(captionSuggestionFor(suggestions, "unknown", "")).toBeNull();
  });
});
