import { MESSAGE_ROUTE_INVENTORY } from "./routeInventory.fixture";
import { describe, expect, it } from "vitest";
import { apiName } from "./shared/apiName";

/**
 * D7 §30 路由前端一致性清单（api-contract §8.3）：
 * 后端注册的 52 条消息路由，前端必须各有一个 API 类（一 API 一文件），且路由名由共享 apiName 推导一致；
 * 公开读取也使用标准 API 类，不保留页面级调用例外。
 */
const MESSAGE_ROUTES = MESSAGE_ROUTE_INVENTORY;

/** 8 条非消息路由（api-contract §5）：不注册路由名，但前端必须知道调用方式。 */
const NON_MESSAGE_ROUTES: readonly string[] = [
  "POST /api/photos/upload（multipart：exhibitionId + files）",
  "GET /api/photos/{id}/content?variant=thumb|full",
  "GET /api/exhibitions/{id}/cover",
  "POST /api/exhibitions/{id}/cover-render（multipart：file）",
  "POST /api/contributions/upload（multipart：exhibitionId + 可选 contributionId + files）",
  "GET /api/contributions/{contributionId}/content?variant=thumb|full（需令牌）",
  "GET /api/health",
  "GET /vendor/three.min.js",
];

const API_FILES = import.meta.glob<string>("./**/*API.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});
const ALL_SOURCES = import.meta.glob<string>("../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});

const fileBaseName = (path: string): string => path.split("/").pop()?.replace(/\.ts$/, "") ?? "";

const apiClassNames = new Set(Object.keys(API_FILES).map(fileBaseName));

const sourcesContain = (text: string): boolean =>
  Object.values(ALL_SOURCES).some((source) => source.includes(text));

describe("52 路由前端一致性清单", () => {
  it("清单本身覆盖 52 条注册路由且不重复", () => {
    expect(MESSAGE_ROUTES).toHaveLength(52);
    const names = MESSAGE_ROUTES.map((route) => route.routeName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("每条消息路由都有对应 API 类文件", () => {
    const missing = MESSAGE_ROUTES.filter(
      (route) => !Object.hasOwn(API_FILES, `./${route.service}/${route.apiClass}.ts`),
    );
    expect(missing).toEqual([]);
  });

  it("API 类名经共享 apiName 推导与后端路由名逐条一致", () => {
    const mismatched = MESSAGE_ROUTES.filter(
      (route) => route.apiClass !== null && apiName(route.apiClass) !== route.routeName,
    ).map((route) => ({
      apiClass: route.apiClass,
      expected: route.routeName,
      actual: apiName(route.apiClass ?? ""),
    }));
    expect(mismatched).toEqual([]);
  });

  it("前端无多余的消息 API 类（唯三例外：照片上传、封面渲染上传、投稿上传）", () => {
    const expected = new Set(
      MESSAGE_ROUTES.flatMap((route) => (route.apiClass === null ? [] : [route.apiClass])),
    );
    const allowedNonMessage = new Set([
      "UploadPhotosAPI",
      "UploadCoverRenderAPI",
      "UploadContributionsAPI",
    ]);
    const extra = [...apiClassNames].filter(
      (name) => !expected.has(name) && !allowedNonMessage.has(name),
    );
    expect(extra).toEqual([]);
  });

  it("非消息路由清单固定 8 条，且本前端实现的上传/私有图片调用点存在", () => {
    expect(NON_MESSAGE_ROUTES).toHaveLength(8);
    expect(sourcesContain("/api/photos/upload")).toBe(true);
    expect(sourcesContain("/cover-render")).toBe(true);
    expect(sourcesContain("/api/contributions/upload")).toBe(true);
    expect(sourcesContain("/api/contributions/${encodeURIComponent(contributionId)}/content")).toBe(true);
    expect(sourcesContain("/vendor/three.min.js")).toBe(true);
  });
});
