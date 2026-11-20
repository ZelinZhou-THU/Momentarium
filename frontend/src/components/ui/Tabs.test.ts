import { describe, expect, it } from "vitest";
import { nextTabId } from "./Tabs";
import type { TabItem } from "./Tabs";

const items: readonly TabItem[] = [
  { id: "photos", label: "照片" },
  { id: "curation", label: "策展" },
  { id: "inspiration", label: "AI 灵感" },
  { id: "scene", label: "三维场景" },
  { id: "publish", label: "发布" },
];

describe("Tabs 键盘导航（纯函数）", () => {
  it("左右方向键循环切换", () => {
    expect(nextTabId(items, "photos", "ArrowRight")).toBe("curation");
    expect(nextTabId(items, "publish", "ArrowRight")).toBe("photos");
    expect(nextTabId(items, "photos", "ArrowLeft")).toBe("publish");
    expect(nextTabId(items, "scene", "ArrowLeft")).toBe("inspiration");
  });

  it("Home/End 跳到首尾", () => {
    expect(nextTabId(items, "scene", "Home")).toBe("photos");
    expect(nextTabId(items, "curation", "End")).toBe("publish");
  });

  it("空列表返回 null，未知 activeId 从第一项起算", () => {
    expect(nextTabId([], "photos", "ArrowRight")).toBeNull();
    expect(nextTabId(items, "unknown", "ArrowRight")).toBe("curation");
    expect(nextTabId(items, "unknown", "Home")).toBe("photos");
  });
});
