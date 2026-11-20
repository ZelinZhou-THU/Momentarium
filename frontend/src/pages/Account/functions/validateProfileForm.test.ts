import { describe, expect, it } from "vitest";
import { hasProfileErrors, validateProfileForm } from "./validateProfileForm";

describe("validateProfileForm", () => {
  it("显示名去空白后不能为空、不超过 32 字；简介不超过 200 字", () => {
    expect(validateProfileForm({ displayName: "  ", bio: "", homepagePublic: false })).toEqual({
      displayName: "显示名不能为空",
      bio: null,
    });
    expect(validateProfileForm({ displayName: "字".repeat(33), bio: "字".repeat(201), homepagePublic: true })).toEqual({
      displayName: "显示名最多 32 个字",
      bio: "简介最多 200 个字",
    });
  });

  it("emoji 按一个字计", () => {
    expect(validateProfileForm({ displayName: "🙂".repeat(32), bio: "", homepagePublic: false }).displayName).toBeNull();
  });

  it("合法输入没有错误", () => {
    expect(hasProfileErrors(validateProfileForm({ displayName: "林间", bio: "", homepagePublic: true }))).toBe(false);
  });
});
