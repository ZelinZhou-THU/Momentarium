import { describe, expect, it } from "vitest";
import { formatPublishedAt, formatVersion } from "./formatPublishedAt";

describe("公开页 meta 展示格式", () => {
  it("ISO 时间转中文日期（含年），非法值原样返回不崩", () => {
    expect(formatPublishedAt("2026-10-27T15:00:00Z")).toContain("2026");
    expect(formatPublishedAt("not-a-date")).toBe("not-a-date");
  });

  it("版本号展示", () => {
    expect(formatVersion(2)).toBe("第 2 版");
  });
});
