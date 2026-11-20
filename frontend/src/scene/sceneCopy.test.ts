import { describe, expect, it } from "vitest";

/** 纯场景（D7 task-53）文案清单：源码级断言，避免为纯文案引入重型组件渲染依赖。 */
const SCENE_SOURCES = import.meta.glob<string>("./**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});
const WORKSPACE_SOURCES = import.meta.glob<string>("../pages/Workspace/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});

const productionSources = (sources: Record<string, string>): readonly string[] =>
  Object.entries(sources)
    .filter(([path]) => !path.endsWith(".test.ts") && !path.endsWith(".test.tsx"))
    .map(([, source]) => source);

const contains = (sources: Record<string, string>, text: string): boolean =>
  productionSources(sources).some((source) => source.includes(text));

describe("纯场景前端配套（D7 task-53）", () => {
  it("ScenePanel 不再要求照片出现在 3D 场景里，改为照片区查看大图/图注", () => {
    expect(contains({ ...SCENE_SOURCES, ...WORKSPACE_SOURCES }, "场景本身不再陈列照片")).toBe(true);
    expect(contains({ ...SCENE_SOURCES, ...WORKSPACE_SOURCES }, "照片可在照片区查看大图与图注")).toBe(true);
    expect(contains({ ...SCENE_SOURCES, ...WORKSPACE_SOURCES }, "照片必须可辨认")).toBe(false);
  });

  it("沙箱仍向 ctx 传 photos 兼容旧代码，但不再把未使用照片当预检失败", () => {
    expect(contains({ ...SCENE_SOURCES, ...WORKSPACE_SOURCES }, "photos 仍传给 ctx 以兼容旧场景代码")).toBe(true);
    expect(contains({ ...SCENE_SOURCES, ...WORKSPACE_SOURCES }, "未使用的照片")).toBe(false);
  });

  it("工作台照片区提供大图查看入口与说明", () => {
    expect(contains(WORKSPACE_SOURCES, "查看大图")).toBe(true);
    expect(contains(WORKSPACE_SOURCES, "照片大图与图注可在上方「照片」区域查看")).toBe(true);
  });
});
