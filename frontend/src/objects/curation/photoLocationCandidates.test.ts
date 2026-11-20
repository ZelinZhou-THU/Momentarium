import { describe, expect, it } from "vitest";
import { parsePhotoLocationCandidatesResponse } from "./PhotoLocationCandidatesResponse";

const response = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  photoId: "9a1b2c3d-4e5f-4a6b-8c7d-1e2f3a4b5c6d",
  candidates: [
    {
      id: "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
      name: "济州岛 · 涉地可支",
      latitude: 33.4592,
      longitude: 126.936,
      granularity: "area",
      reason: "海岸悬崖与灯塔的组合与该地标一致",
    },
    {
      id: "c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f",
      name: "济州岛",
      latitude: null,
      longitude: null,
      granularity: null,
      reason: "只能确认到岛屿范围",
    },
  ],
  model: "photo-location-v1",
  generatedAt: "2026-11-04T01:30:00Z",
  ...overrides,
});

describe("AI 地点候选 DTO（v1.13）", () => {
  it("解码有坐标与仅名称两种候选；空列表合法", () => {
    const parsed = parsePhotoLocationCandidatesResponse(response());
    expect(parsed.photoId).toBe("9a1b2c3d-4e5f-4a6b-8c7d-1e2f3a4b5c6d");
    expect(parsed.candidates).toHaveLength(2);
    expect(parsed.candidates[0]!.granularity).toBe("area");
    expect(parsed.candidates[1]!.granularity).toBeNull();
    expect(parsed.model).toBe("photo-location-v1");

    const empty = parsePhotoLocationCandidatesResponse(
      response({ candidates: [], model: null, generatedAt: null }),
    );
    expect(empty.candidates).toEqual([]);
    expect(empty.model).toBeNull();
    expect(empty.generatedAt).toBeNull();
  });

  it("非法候选粒度被拒绝，候选字段严格解码", () => {
    expect(() =>
      parsePhotoLocationCandidatesResponse(
        response({
          candidates: [
            {
              id: "x",
              name: "x",
              latitude: null,
              longitude: null,
              granularity: "hidden",
              reason: "x",
            },
          ],
        }),
      ),
    ).toThrow();
  });
});
