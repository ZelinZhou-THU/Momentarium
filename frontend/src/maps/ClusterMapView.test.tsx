import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClusterMapPlaceholder, ClusterMapView } from "./ClusterMapView";

describe("聚类地图组件（服务端渲染的初始状态）", () => {
  it("首屏显示加载提示与可访问名称，未加载时不渲染真实地图内容", () => {
    const html = renderToStaticMarkup(
      <ClusterMapView markers={[]} ariaLabel="作者公开足迹地图" className="aspect-[21/9]" />,
    );
    expect(html).toContain("正在加载足迹地图");
    expect(html).toContain('aria-label="作者公开足迹地图"');
    expect(html).toContain("aspect-[21/9]");
  });

  it("延迟加载占位保留高度且对读屏隐藏", () => {
    const html = renderToStaticMarkup(<ClusterMapPlaceholder className="aspect-[21/9]" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("aspect-[21/9]");
  });
});
