import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { AuthorPageView, AuthorJourneyLocation } from "../../../../objects/gallery/AuthorPageView";
import { buildJourneyData } from "../../functions/buildJourneyData";
import { JourneyMapSection } from "./index";
import { JourneyLocationList } from "./JourneyLocationList";

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

const normalize = (html: string): string => html.replaceAll("<!-- -->", "");

describe("作者主页足迹地图区域渲染（服务端渲染，不加载真实地图）", () => {
  it("有公开地点时显示地图区域、隐私说明、摘要与加载占位", () => {
    const html = normalize(
      renderToStaticMarkup(
        <JourneyMapSection
          page={page([
            location(),
            location({ exhibitionId: "e2", exhibitionTitle: "山雾", photoId: "p2" }),
          ])}
        />,
      ),
    );
    expect(html).toContain("足迹地图");
    expect(html).toContain("地图瓦片来自 OpenStreetMap；仅显示作者公开的地点。");
    expect(html).toContain("共 2 个公开地点 · 2 场展览");
    expect(html).toContain("正在加载足迹地图");
    expect(html).toContain('aria-label="作者公开足迹地图"');
  });

  it("没有公开位置时整块地图不显示（正常空态，不是错误态）", () => {
    const html = normalize(renderToStaticMarkup(<JourneyMapSection page={page([])} />));
    expect(html).toBe("");
    expect(html).not.toContain("足迹地图");
    expect(html).not.toContain("地图暂时不可用");
  });

  it("降级列表按展览分组，含缩略图、地点名与查看展览链接", () => {
    const data = buildJourneyData(
      page([
        location(),
        location({ photoId: "p2", name: "济州市" }),
        location({ exhibitionId: "e2", exhibitionTitle: "山雾", photoId: "p3" }),
      ]),
    );
    const html = normalize(
      renderToStaticMarkup(
        <MemoryRouter>
          <JourneyLocationList groups={data.groups} />
        </MemoryRouter>,
      ),
    );
    expect(html).toContain("雾港");
    expect(html).toContain("山雾");
    expect(html).toContain("济州岛 · 涉地可支");
    expect(html).toContain("济州市");
    expect(html).toContain("查看展览");
    expect(html).toContain("/api/photos/p1/content?variant=thumb");
    expect(html).toContain('href="/show/e1"');
    expect(html).toContain('href="/show/e2"');
  });
});
