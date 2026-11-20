import { describe, expect, it } from "vitest";
import { moveLightbox, openLightbox } from "./LightboxState";

describe("大图状态", () => {
  it("打开时没有翻页方向；找不到站点时保持关闭", () => {
    expect(openLightbox(2)).toEqual({ index: 2, direction: "none" });
    expect(openLightbox(null)).toBeNull();
  });

  it("翻页方向由前后位置决定", () => {
    const opened = { index: 2, direction: "none" } as const;
    expect(moveLightbox(opened, 3)).toEqual({ index: 3, direction: "forward" });
    expect(moveLightbox(opened, 1)).toEqual({ index: 1, direction: "backward" });
  });
});
