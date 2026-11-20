import { describe, expect, it } from "vitest";
import type { AuthorPageView, AuthorJourneyLocation } from "../../../objects/gallery/AuthorPageView";
import {
  buildJourneyClusterMarkers,
  buildJourneyData,
  buildJourneyPopupHtml,
  escapeHtml,
  journeyExhibitionPath,
  journeyThumbUrl,
} from "./buildJourneyData";

const location = (overrides: Partial<AuthorJourneyLocation> = {}): AuthorJourneyLocation => ({
  exhibitionId: "e1",
  exhibitionTitle: "雾港",
  photoId: "p1",
  name: "济州岛 · 涉地可支",
  latitude: 33.4592,
  longitude: 126.936,
  granularity: "exact",
  ...overrides,
});

const page = (journeyLocations: readonly AuthorJourneyLocation[]): AuthorPageView => ({
  username: "memory_curator",
  displayName: "林间拾光",
  bio: "",
  exhibitions: [],
  journeyLocations,
});

describe("作者主页足迹数据装配", () => {
  it("过滤非法坐标，按响应顺序分组并给出摘要", () => {
    const data = buildJourneyData(
      page([
        location({ photoId: "p1" }),
        location({ photoId: "p2", granularity: "area" }),
        location({ exhibitionId: "e2", exhibitionTitle: "山雾", photoId: "p3" }),
        location({ photoId: "p5", latitude: 200 }),
      ]),
    );

    expect(data.markers.map((marker) => marker.photoId)).toEqual(["p1", "p2", "p3"]);
    expect(data.summary).toBe("共 3 个公开地点 · 2 场展览");
    expect(data.groups.map((group) => group.exhibitionId)).toEqual(["e1", "e2"]);
    expect(data.groups[0]?.locations.map((marker) => marker.photoId)).toEqual(["p1", "p2"]);
    expect(data.groups[1]?.locations.map((marker) => marker.photoId)).toEqual(["p3"]);
  });

  it("同一展览的地点即使被其他展览隔开也归入同一组（防御性分组）", () => {
    const data = buildJourneyData(
      page([
        location({ photoId: "p1" }),
        location({ exhibitionId: "e2", photoId: "p2" }),
        location({ photoId: "p3" }),
      ]),
    );
    expect(data.groups.map((group) => group.exhibitionId)).toEqual(["e1", "e2"]);
    expect(data.groups[0]?.locations.map((marker) => marker.photoId)).toEqual(["p1", "p3"]);
  });

  it("没有公开位置时是正常空数据（页面据此不显示地图）", () => {
    const data = buildJourneyData(page([]));
    expect(data.markers).toEqual([]);
    expect(data.groups).toEqual([]);
    expect(data.summary).toBe("共 0 个公开地点 · 0 场展览");
  });

  it("弹窗包含缩略图、地点名、展览名与查看展览链接，并对作者输入做 HTML 转义", () => {
    const marker = buildJourneyData(
      page([
        location({
          name: '<img onerror="x"> 涉地可支',
          exhibitionTitle: "海 & 山",
        }),
      ]),
    ).markers[0]!;
    const html = buildJourneyPopupHtml(marker);

    expect(html).toContain(journeyThumbUrl("p1"));
    expect(html).toContain(`href="${journeyExhibitionPath("e1")}"`);
    expect(html).toContain("查看展览");
    expect(html).toContain("&lt;img onerror=&quot;x&quot;&gt; 涉地可支");
    expect(html).toContain("海 &amp; 山");
    expect(html).not.toContain("<img onerror");
  });

  it("地点名为空时回退为“未命名地点”，缩略图与链接路径对特殊字符做编码", () => {
    const marker = buildJourneyData(
      page([location({ name: "  ", photoId: "photo 1", exhibitionId: "ex/1" })]),
    ).markers[0]!;
    const html = buildJourneyPopupHtml(marker);
    expect(html).toContain("未命名地点");
    expect(html).toContain("/api/photos/photo%201/content?variant=thumb");
    expect(html).toContain("/show/ex%2F1");
  });

  it("聚类标记带稳定 id、名称标签与弹窗 HTML", () => {
    const data = buildJourneyData(page([location()]));
    const clusterMarkers = buildJourneyClusterMarkers(data.markers);
    expect(clusterMarkers).toHaveLength(1);
    expect(clusterMarkers[0]?.id).toBe("e1:p1");
    expect(clusterMarkers[0]?.label).toBe("济州岛 · 涉地可支");
    expect(clusterMarkers[0]?.popupHtml).toBe(buildJourneyPopupHtml(data.markers[0]!));
  });

  it("escapeHtml 覆盖五个 HTML 元字符", () => {
    expect(escapeHtml('<a href="x">&\'</a>')).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;",
    );
  });
});
