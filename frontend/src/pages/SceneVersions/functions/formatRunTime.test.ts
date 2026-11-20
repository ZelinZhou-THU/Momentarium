import { describe, expect, it } from "vitest";
import { formatRunTime } from "./formatRunTime";

describe("formatRunTime", () => {
  it("包含月、日与时分", () => {
    const text = formatRunTime("2026-10-31T08:10:00Z");
    expect(text).toMatch(/10月/);
    expect(text).toMatch(/\d{2}:\d{2}/);
  });
});
