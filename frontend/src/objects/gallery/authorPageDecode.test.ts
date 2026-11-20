import { describe, expect, it } from "vitest";
import { DecodeError } from "../../apis/shared/decode";
import { parseAuthorPageView } from "./AuthorPageView";

const EXHIBITION_ID = "0b6f3c1e-7f2a-4a34-9be1-2f6d5c8a9d10";
const PHOTO_ID = "9a1b2c3d-4e5f-4a6b-8c7d-1e2f3a4b5c6d";

const card = {
  id: EXHIBITION_ID,
  title: "雾港",
  narration: "海雾里的港口。",
  cover: { kind: "auto", imageUrl: `/api/exhibitions/${EXHIBITION_ID}/cover`, width: 1600, height: 900 },
  version: 2,
  publishedAt: "2026-11-02T08:00:00Z",
  scenePalette: ["#22313B"],
};

const page = {
  username: "memory_curator",
  displayName: "林间拾光",
  bio: "把旅行留在记忆里。",
  exhibitions: [card],
  journeyLocations: [
    {
      exhibitionId: EXHIBITION_ID,
      exhibitionTitle: "雾港",
      photoId: PHOTO_ID,
      name: "济州岛 · 涉地可支",
      latitude: 33.4592,
      longitude: 126.936,
      granularity: "exact",
    },
    {
      exhibitionId: EXHIBITION_ID,
      exhibitionTitle: "雾港",
      photoId: "1f2e3d4c-5b6a-4978-8d6c-5e4f3a2b1c0d",
      name: "济州市",
      latitude: 33.4996,
      longitude: 126.5312,
      granularity: "area",
    },
  ],
};

describe("AuthorPageView 足迹位置解码（契约 v1.8）", () => {
  it("解析 journeyLocations：展览/照片/地点/坐标/公开粒度与顺序", () => {
    const parsed = parseAuthorPageView(page);
    expect(parsed.exhibitions).toHaveLength(1);
    expect(parsed.journeyLocations).toHaveLength(2);
    expect(parsed.journeyLocations.map((location) => location.name)).toEqual([
      "济州岛 · 涉地可支",
      "济州市",
    ]);
    expect(parsed.journeyLocations[0]?.granularity).toBe("exact");
    expect(parsed.journeyLocations[1]?.latitude).toBe(33.4996);
  });

  it("旧响应缺少 journeyLocations 时按 [] 兼容", () => {
    const oldResponse: Record<string, unknown> = { ...page };
    delete oldResponse.journeyLocations;
    expect(parseAuthorPageView(oldResponse).journeyLocations).toEqual([]);
  });

  it("journeyLocations 出现时严格解码：非数组、缺字段、非法枚举都报错", () => {
    expect(() =>
      parseAuthorPageView({ ...page, journeyLocations: "not-an-array" }),
    ).toThrow(DecodeError);

    expect(() =>
      parseAuthorPageView({
        ...page,
        journeyLocations: [{ ...page.journeyLocations[0], granularity: "city" }],
      }),
    ).toThrow(DecodeError);

    // 契约 v1.8：足迹只允许 area/exact，hidden 是违约值而不是“静默过滤”。
    expect(() =>
      parseAuthorPageView({
        ...page,
        journeyLocations: [{ ...page.journeyLocations[0], granularity: "hidden" }],
      }),
    ).toThrow(DecodeError);

    expect(() =>
      parseAuthorPageView({
        ...page,
        journeyLocations: [{ ...page.journeyLocations[0], exhibitionId: undefined }],
      }),
    ).toThrow(DecodeError);

    expect(() =>
      parseAuthorPageView({
        ...page,
        journeyLocations: [{ ...page.journeyLocations[0], latitude: "33.4" }],
      }),
    ).toThrow(DecodeError);
  });
});
