import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LocationRow } from "../functions/buildLocationRows";
import type { LocationDraft } from "../objects/MapPanelState";
import { LocationEditor } from "./LocationEditor";

const row: LocationRow = {
  photoId: "photo-1",
  label: "退潮后的礁石",
  thumbUrl: "/api/photos/photo-1/content?variant=thumb",
  location: null,
  point: null,
};

const draft: LocationDraft = {
  photoId: "photo-1",
  name: "",
  latitude: "",
  longitude: "",
  granularity: "hidden",
};

const renderEditor = (
  candidateState: Parameters<typeof LocationEditor>[0]["candidateState"],
  overrides: Partial<Parameters<typeof LocationEditor>[0]> = {},
): string =>
  renderToStaticMarkup(
    <LocationEditor
      row={row}
      draft={draft}
      searchState={{ status: "idle" }}
      saveState={{ status: "idle" }}
      errors={null}
      isSaving={false}
      candidateState={candidateState}
      ignoredCandidateIds={[]}
      candidateConfirmState={{ status: "idle" }}
      onUpdateDraft={vi.fn()}
      onSearch={vi.fn()}
      onApplyCandidate={vi.fn()}
      onSave={vi.fn()}
      onClear={vi.fn()}
      onSuggestCandidates={vi.fn()}
      onRefreshCandidates={vi.fn()}
      onIgnoreCandidate={vi.fn()}
      onConfirmCandidate={vi.fn()}
      {...overrides}
    />,
  );

const coordsCandidate = {
  id: "cand-1",
  name: "济州岛 · 涉地可支",
  latitude: 33.4592,
  longitude: 126.936,
  granularity: "area" as const,
  reason: "海岸悬崖与灯塔的组合与该地标一致",
};

const nameOnlyCandidate = {
  id: "cand-2",
  name: "济州岛",
  latitude: null,
  longitude: null,
  granularity: null,
  reason: "只能确认到岛屿范围",
};

describe("MapPanel AI 地点候选 UI（SSR）", () => {
  it("候选列表显示名称/坐标/仅名称/理由，并提供采用与忽略", () => {
    const html = renderEditor({
      status: "ready",
      origin: "stored",
      candidates: [coordsCandidate, nameOnlyCandidate],
      model: "photo-location-v1",
      generatedAt: "2026-11-04T01:30:00Z",
    });
    expect(html).toContain("AI 位置候选");
    expect(html).toContain("AI 识别地点");
    expect(html).toContain("济州岛 · 涉地可支");
    expect(html).toContain("海岸悬崖与灯塔的组合与该地标一致");
    expect(html).toContain("仅名称（无坐标）");
    expect(html).toContain("采用为位置");
    expect(html).toContain("忽略");
    // 内部模型标识不对用户展示。
    expect(html).not.toContain("photo-location-v1");
    expect(html).toContain("由 AI 根据照片推测");
  });

  it("还无候选与 AI 无可靠地点使用不同文案", () => {
    const storedEmpty = renderEditor({ status: "empty", origin: "stored" });
    expect(storedEmpty).toContain("还没有 AI 候选");
    expect(storedEmpty).toContain("AI 识别地点");

    const suggestedEmpty = renderEditor({ status: "empty", origin: "suggested" });
    expect(suggestedEmpty).toContain("AI 没有给出可靠地点");
    expect(suggestedEmpty).toContain("重新识别");
  });

  it("读取/识别失败显示可重试错误，不遮蔽手动编辑", () => {
    const html = renderEditor({
      status: "failed",
      origin: "suggested",
      message: "AI 地点识别暂时失败；可以稍后重试，或直接手动填写位置。",
    });
    expect(html).toContain("AI 地点识别暂时失败");
    expect(html).toContain("重试 AI 识别");
    // 手动编辑入口仍在。
    expect(html).toContain("按地点名称搜索");
    expect(html).toContain("保存位置");
  });

  it("未选照片时不显示 AI 候选区", () => {
    const html = renderEditor({ status: "idle" }, { row: null, draft: null });
    expect(html).not.toContain("AI 位置候选");
    expect(html).toContain("先在上方的照片列表里选择一张照片。");
  });
});
