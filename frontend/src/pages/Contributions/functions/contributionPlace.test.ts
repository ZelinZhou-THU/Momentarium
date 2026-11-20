import { describe, expect, it } from "vitest";
import {
  applyMapPointToFields,
  applyPlaceCandidateToFields,
  describeContributionMapHint,
  describeMissingPlaceName,
  EMPTY_LOCATION_FIELDS,
  locationFieldsOf,
  pickedMarkersOf,
  pointOfFields,
} from "./contributionPlace";
import { validateContributionEditor } from "./contributionGroups";

const candidate = {
  name: "涯月邑",
  displayName: "涯月邑, 济州市, 济州特别自治道, 韩国",
  latitude: 33.4632,
  longitude: 126.3175,
};

describe("投稿者地点字段", () => {
  it("没有地点时是空字段；有地点时坐标转成字符串", () => {
    expect(locationFieldsOf(null)).toEqual(EMPTY_LOCATION_FIELDS);
    expect(locationFieldsOf({ name: "涯月邑", latitude: 33.4632, longitude: 126.3175 })).toEqual({
      name: "涯月邑",
      latitude: "33.4632",
      longitude: "126.3175",
    });
    expect(locationFieldsOf({ name: "只有地名", latitude: null, longitude: null })).toEqual({
      name: "只有地名",
      latitude: "",
      longitude: "",
    });
  });

  it("搜索结果填入名称与坐标；短名为空时退回完整名称", () => {
    expect(applyPlaceCandidateToFields(candidate)).toEqual({
      name: "涯月邑",
      latitude: "33.4632",
      longitude: "126.3175",
    });
    expect(applyPlaceCandidateToFields({ ...candidate, name: "  " }).name).toBe(candidate.displayName);
  });

  it("搜索结果填入后能直接通过编辑器校验（名称与坐标成对）", () => {
    const fields = applyPlaceCandidateToFields(candidate);
    const validated = validateContributionEditor("回忆", true, fields.name, fields.latitude, fields.longitude);
    expect(validated).toEqual({
      ok: true,
      memoryText: "回忆",
      location: { name: "涯月邑", latitude: 33.4632, longitude: 126.3175 },
    });
  });

  it("地图落点只改坐标，保留已填的名称", () => {
    const fields = applyMapPointToFields(
      { name: "我家门口", latitude: "", longitude: "" },
      { latitude: 33.123456789, longitude: 126.5 },
    );
    expect(fields).toEqual({ name: "我家门口", latitude: "33.123457", longitude: "126.500000" });
  });

  it("只有合法坐标才画标记，半填或越界不画", () => {
    expect(pointOfFields({ name: "x", latitude: "33.4", longitude: "126.3" })).toEqual({
      latitude: 33.4,
      longitude: 126.3,
    });
    expect(pointOfFields({ name: "x", latitude: "33.4", longitude: "" })).toBeNull();
    expect(pointOfFields({ name: "x", latitude: "91", longitude: "126" })).toBeNull();
    expect(pointOfFields({ name: "x", latitude: "abc", longitude: "126" })).toBeNull();

    expect(pickedMarkersOf("", "33.4", "126.3")).toEqual([
      expect.objectContaining({ label: "已选位置", shape: "point" }),
    ]);
    expect(pickedMarkersOf("涯月", "33.4", "126.3")[0]?.label).toBe("涯月");
    expect(pickedMarkersOf("涯月", "", "")).toEqual([]);
  });

  it("落点后名称为空会提醒补名称，有名称或没坐标则不提醒", () => {
    expect(describeMissingPlaceName({ name: "", latitude: "33.4", longitude: "126.3" })).toContain("名字");
    expect(describeMissingPlaceName({ name: "涯月", latitude: "33.4", longitude: "126.3" })).toBeNull();
    expect(describeMissingPlaceName(EMPTY_LOCATION_FIELDS)).toBeNull();
  });

  it("地图不可用时提示仍可搜索或手填；正常在线不打扰", () => {
    expect(describeContributionMapHint("failed", true)).toContain("仍可搜索地点或直接填写坐标");
    expect(describeContributionMapHint("failed", false)).toContain("网络不可用");
    expect(describeContributionMapHint("ready", false)).toContain("网络已断开");
    expect(describeContributionMapHint("ready", true)).toBeNull();
    expect(describeContributionMapHint("closed", true)).toBeNull();
    expect(describeContributionMapHint("loading", true)).toBeNull();
  });
});
