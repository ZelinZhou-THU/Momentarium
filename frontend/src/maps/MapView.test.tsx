import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MapView } from "./MapView";

const noop = (): void => {};

describe("地图组件（服务端渲染的初始状态）", () => {
  it("首屏显示加载提示与可访问名称，未加载时不渲染 Leaflet 容器内容", () => {
    const html = renderToStaticMarkup(
      <MapView
        markers={[]}
        selectedMarkerId={null}
        onSelectMarker={noop}
        ariaLabel="展览地图"
      />,
    );
    expect(html).toContain("正在加载在线地图");
    expect(html).toContain('aria-label="展览地图"');
    expect(html).toContain("aspect-video");
  });
});
