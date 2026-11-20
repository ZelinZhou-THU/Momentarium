import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IntroGate } from "./IntroGate";
import { SceneView } from "./SceneView";
import { PublicShowError, PublicShowLoading, PublicShowNotFound } from "./PublicShowStatus";
import { publicShowPresentation } from "../functions/buildDraftPreview";
import {
  createPublicExhibitionFixture,
  createPublicPlayingSceneFixture,
} from "../mocks/publicShowFixtures";

const noop = (): void => {};
const normalize = (html: string): string => html.replaceAll("<!-- -->", "");

describe("公开页组件渲染（本地 fixture 驱动，非最终证据）", () => {
  it("先导页展示封面、标题、叙事、入口导语与进入按钮", () => {
    const html = normalize(
      renderToString(<IntroGate exhibition={createPublicExhibitionFixture()} presentation={publicShowPresentation(createPublicExhibitionFixture())} isEntering={false} onEnter={noop} />),
    );
    expect(html).toContain("济州岛的海与山");
    expect(html).toContain("一次安静的海边旅行");
    expect(html).toContain("沿着潮声走进这片黄昏");
    expect(html).toContain("进入记忆");
    expect(html).toContain("第 2 版");
    expect(html).toContain("/api/exhibitions/exhibition-public-01/cover");
  });

  it("进入中：按钮进入忙态（aria-busy）且仍保留文案", () => {
    const html = normalize(
      renderToString(<IntroGate exhibition={createPublicExhibitionFixture()} presentation={publicShowPresentation(createPublicExhibitionFixture())} isEntering onEnter={noop} />),
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("进入记忆");
    expect(html).toContain("正在准备场景与照片");
  });

  it("未进入时不显示准备提示", () => {
    const html = normalize(
      renderToString(<IntroGate exhibition={createPublicExhibitionFixture()} presentation={publicShowPresentation(createPublicExhibitionFixture())} isEntering={false} onEnter={noop} />),
    );
    expect(html).not.toContain("正在准备场景与照片");
  });

  it("3D 页面包含退出、章节侧栏与图注，初始为加载遮罩而非错误遮罩", () => {
    const exhibition = createPublicExhibitionFixture();
    const html = normalize(
      renderToString(
        <SceneView
          exhibition={exhibition}
          playing={createPublicPlayingSceneFixture(exhibition)}
          presentation={publicShowPresentation(exhibition)}
          onExit={noop}
        />,
      ),
    );
    expect(html).toContain("退出场景");
    expect(html).toContain("收起侧栏");
    expect(html).toContain("地图 · 2");
    expect(html).toContain("退潮的礁石");
    expect(html).toContain("黄昏时分的海面");
    expect(html).toContain("正在搭建三维场景");
    expect(html).toContain("沿着潮声走进这片黄昏");
    expect(html).not.toContain("场景无法显示");
  });

  it("loading / notfound / error 三态文案齐全", () => {
    expect(renderToString(<PublicShowLoading />)).toContain("正在打开展览");
    expect(renderToString(<PublicShowNotFound />)).toContain("未找到或未发布");
    const errorHtml = normalize(renderToString(<PublicShowError message="无法连接服务器" onRetry={noop} />));
    expect(errorHtml).toContain("无法打开场景");
    expect(errorHtml).toContain("无法连接服务器");
    expect(errorHtml).toContain("重新加载");
  });
});
