import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// 服务端渲染不需要会话令牌；避免 tokenStorage 在 node 环境读取 window。
vi.mock("../../../../stores/sessionStore", () => ({ getSessionToken: () => null }));

import { MapPanel } from "./index";
import { createMapPanelDetail } from "./mocks/mapPanelFixtures";

const noop = (): void => {};
const normalize = (html: string): string => html.replaceAll("<!-- -->", "");

describe("工作台地图分区渲染（服务端渲染，不加载真实地图）", () => {
  it("可见骨架：照片位置列表 + 展览地图 + 位置与公开范围编辑", () => {
    const html = normalize(
      renderToString(<MapPanel exhibition={createMapPanelDetail()} onChanged={noop} />),
    );
    expect(html).toContain("照片位置");
    expect(html).toContain("已定位 2 / 3 张");
    expect(html).toContain("已确认 · 公开精确点");
    expect(html).toContain("推测位置 · 待确认（EXIF 建议）");
    expect(html).toContain("展览地图");
    expect(html).toContain("开启在线地图");
    expect(html).toContain("OpenStreetMap");
    expect(html).toContain("位置与公开范围");
    expect(html).toContain("AI 位置候选");
    expect(html).toContain("AI 识别地点");
    expect(html).toContain("候选未确认不会进入地图或发布快照");
    expect(html).toContain("按地点名称搜索");
    expect(html).toContain("不公开");
    expect(html).toContain("公开范围");
    expect(html).toContain("公开精确点");
    expect(html).toContain("济州岛 · 涉地可支");
    expect(html).toContain("保存位置");
    expect(html).toContain("清除位置");
    expect(html).toContain("清空坐标");
  });

  it("默认不加载在线地图：只显示外部依赖说明与开启按钮", () => {
    const html = normalize(
      renderToString(<MapPanel exhibition={createMapPanelDetail()} onChanged={noop} />),
    );
    expect(html).toContain("访问者 IP");
    expect(html).not.toContain("正在加载在线地图");
  });

  it("没有照片时列表与编辑给正常空态，而不是错误态", () => {
    const html = normalize(
      renderToString(
        <MapPanel
          exhibition={createMapPanelDetail({
            groups: [],
            ungroupedPhotos: [],
            locations: [],
          })}
          onChanged={noop}
        />,
      ),
    );
    expect(html).toContain("还没有照片。先到「照片」分区上传");
    expect(html).toContain("先在上方的照片列表里选择一张照片。");
    expect(html).not.toContain("请求失败");
  });
});
