import { describe, expect, it } from "vitest";
import { readPreviewLocationState } from "./PreviewLocationState";

describe("看展预览的跳转来源", () => {
  it("只接受形状正确的 location.state", () => {
    expect(readPreviewLocationState({ backTo: "/exhibitions", backLabel: "← 我的展览" })).toEqual({
      backTo: "/exhibitions",
      backLabel: "← 我的展览",
    });
    expect(readPreviewLocationState(null)).toBeNull();
    expect(readPreviewLocationState({ backTo: 1 })).toBeNull();
  });
});
