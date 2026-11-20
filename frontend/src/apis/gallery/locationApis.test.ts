import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../stores/sessionStore", () => ({ getSessionToken: () => "token" }));

import { apiName } from "../shared/apiName";
import { ClearPhotoLocationAPI } from "./ClearPhotoLocationAPI";
import { SearchPlacesAPI } from "./SearchPlacesAPI";
import { SetPhotoLocationAPI } from "./SetPhotoLocationAPI";

const PHOTO_ID = "2a3b4c5d-6e7f-4081-92a3-b4c5d6e7f809";

const fetchMock = (): ReturnType<typeof vi.spyOn> =>
  vi.spyOn(globalThis, "fetch");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("位置 API 类（契约 v1.7）", () => {
  it("类名经共享 apiName 推导与后端消息路由名一致", () => {
    expect(apiName(SetPhotoLocationAPI.name)).toBe("setphotolocation");
    expect(apiName(ClearPhotoLocationAPI.name)).toBe("clearphotolocation");
    expect(apiName(SearchPlacesAPI.name)).toBe("searchplaces");
  });

  it("SetPhotoLocationAPI 发送 photoId/name/经纬度/粒度并解码返回的作者位置", async () => {
    const mock = fetchMock().mockResolvedValue(
      new Response(
        JSON.stringify({
          photoId: PHOTO_ID,
          source: "manual",
          status: "confirmed",
          name: "济州岛 · 涉地可支",
          latitude: 33.4592,
          longitude: 126.936,
          granularity: "exact",
        }),
      ),
    );

    const view = await new SetPhotoLocationAPI(PHOTO_ID, "济州岛 · 涉地可支", "exact", 33.4592, 126.936).send();

    expect(mock.mock.calls[0]?.[0]).toBe("/api/setphotolocation");
    const body = JSON.parse(String(mock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      photoId: PHOTO_ID,
      name: "济州岛 · 涉地可支",
      latitude: 33.4592,
      longitude: 126.936,
      granularity: "exact",
    });
    expect(view.status).toBe("confirmed");
    expect(view.granularity).toBe("exact");
  });

  it("粒度 hidden 时坐标按契约发送 null（可选字段不省略）", async () => {
    const mock = fetchMock().mockResolvedValue(
      new Response(
        JSON.stringify({
          photoId: PHOTO_ID,
          source: "manual",
          status: "confirmed",
          name: "济州市",
          latitude: null,
          longitude: null,
          granularity: "hidden",
        }),
      ),
    );

    await new SetPhotoLocationAPI(PHOTO_ID, "济州市", "hidden").send();
    const body = JSON.parse(String(mock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(Object.hasOwn(body, "latitude")).toBe(true);
    expect(Object.hasOwn(body, "longitude")).toBe(true);
    expect(body.latitude).toBeNull();
    expect(body.longitude).toBeNull();
  });

  it("ClearPhotoLocationAPI 只提交 photoId，幂等成功返回 {}", async () => {
    const mock = fetchMock().mockResolvedValue(new Response("{}"));
    const response = await new ClearPhotoLocationAPI(PHOTO_ID).send();

    expect(mock.mock.calls[0]?.[0]).toBe("/api/clearphotolocation");
    expect(JSON.parse(String(mock.mock.calls[0]?.[1]?.body))).toEqual({ photoId: PHOTO_ID });
    expect(response).toEqual({});
  });

  it("SearchPlacesAPI 只提交 query；空候选是正常结果", async () => {
    const mock = fetchMock().mockResolvedValue(new Response(JSON.stringify({ candidates: [] })));
    const response = await new SearchPlacesAPI("济州岛 涉地可支").send();

    expect(mock.mock.calls[0]?.[0]).toBe("/api/searchplaces");
    expect(JSON.parse(String(mock.mock.calls[0]?.[1]?.body))).toEqual({ query: "济州岛 涉地可支" });
    expect(response.candidates).toEqual([]);
  });
});
