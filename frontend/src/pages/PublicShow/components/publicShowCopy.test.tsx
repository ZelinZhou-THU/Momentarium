import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ShowSidebar } from "./ShowSidebar";
import { IntroGate } from "./IntroGate";
import { createPublicExhibitionFixture } from "../mocks/publicShowFixtures";
import { publicShowPresentation } from "../functions/buildDraftPreview";

const noop = (): void => {};

describe("公开页纯场景文案（D7 task-53）", () => {
  it("章节侧栏说明照片可看大图与图注，并展示展览叙事", () => {
    const exhibition = createPublicExhibitionFixture({ groups: [], photos: [], locations: [] });
    const html = renderToStaticMarkup(
      <ShowSidebar exhibition={exhibition} open lightboxOpen={false} onOpenPhoto={noop} />,
    );
    expect(html).toContain("点击照片查看大图与图注");
    expect(html).toContain("一次安静的海边旅行");
  });

  it("收起的侧栏不可聚焦（inert）且对读屏隐藏", () => {
    const html = renderToStaticMarkup(
      <ShowSidebar
        exhibition={createPublicExhibitionFixture()}
        open={false}
        lightboxOpen={false}
        onOpenPhoto={noop}
      />,
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("inert");
  });

  it("缩略图下有主色与 AI 配文；只有侧栏展开且大图关闭时才带共享元素名", () => {
    const exhibition = createPublicExhibitionFixture();
    const reading = { palette: ["#1B2A4A"], poeticLine: "浪把黄昏揉碎在黑石上", sensory: "" };
    const groups = [
      { ...exhibition.groups[0]!, photos: [{ ...exhibition.groups[0]!.photos[0]!, reading }] },
    ];
    const render = (open: boolean, lightboxOpen: boolean): string =>
      renderToStaticMarkup(
        <ShowSidebar
          exhibition={{ ...exhibition, groups, photos: groups[0]!.photos, locations: [] }}
          open={open}
          lightboxOpen={lightboxOpen}
          onOpenPhoto={noop}
        />,
      );
    expect(render(true, false)).toContain("浪把黄昏揉碎在黑石上");
    expect(render(true, false)).toContain('aria-label="这张照片的主色"');
    expect(render(true, false)).toContain("view-transition-name:photo-photo-jeju-01");
    expect(render(true, true)).not.toContain("view-transition-name");
    expect(render(false, false)).not.toContain("view-transition-name");
  });

  it("有公开位置时侧栏提供地图模式（初始地图：说明外部依赖 + 公开地点列表）", () => {
    const html = renderToStaticMarkup(
      <ShowSidebar
        exhibition={createPublicExhibitionFixture()}
        open
        lightboxOpen={false}
        onOpenPhoto={noop}
        defaultMode="map"
      />,
    );
    expect(html).toContain("地图 · 2");
    expect(html).toContain("已发布的公开地点 · 共 2 处");
    expect(html).toContain("开启公开地图");
    expect(html).toContain("公开范围");
    expect(html).toContain("公开精确点");
    expect(html).toContain("济州岛 · 涉地可支");
  });

  it("没有公开位置时不显示空地图入口", () => {
    const html = renderToStaticMarkup(
      <ShowSidebar
        exhibition={createPublicExhibitionFixture({ locations: [] })}
        open
        lightboxOpen={false}
        onOpenPhoto={noop}
        defaultMode="map"
      />,
    );
    expect(html).not.toContain("开启公开地图");
    expect(html).not.toContain("地图 · ");
    expect(html).toContain("共 2 章");
  });

  it("先导页说明照片在章节侧栏查看大图", () => {
    const html = renderToStaticMarkup(
      <IntroGate exhibition={createPublicExhibitionFixture()} presentation={publicShowPresentation(createPublicExhibitionFixture())} isEntering={false} onEnter={noop} />,
    );
    expect(html).toContain("场景为记忆意境");
    expect(html).toContain("在章节侧栏查看大图");
  });
});
