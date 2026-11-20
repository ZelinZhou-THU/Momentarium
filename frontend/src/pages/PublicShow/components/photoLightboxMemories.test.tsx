import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PhotoLightbox } from "./PhotoLightbox";
import { createPublicPhotoFixture } from "../mocks/publicShowFixtures";
import type { ShowStop } from "../objects/ShowStop";

const stopWithMemories = (): ShowStop => ({
  photo: createPublicPhotoFixture("photo-1", "退潮后的黑色礁石", [
    { text: "那天的海风很大，我们把伞收起来走了很久。", contributorName: "海风" },
    { text: "回程时雨停了。", contributorName: "岛上散步者" },
  ]),
  eyebrow: "第 1 章 · 退潮的礁石",
  words: "退潮后的黑色礁石",
  echoes: ["潮湿的玄武岩气味"],
  palette: ["#1f1b16"],
});

describe("公开页大图讲述（v1.9）", () => {
  it("按署名逐条展示已采用讲述", () => {
    const html = renderToStaticMarkup(
      <PhotoLightbox
        stops={[stopWithMemories()]}
        lightbox={{ index: 0, direction: "none" }}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(html).toContain("来自共同投稿的讲述");
    expect(html).toContain("那天的海风很大");
    expect(html).toContain("海风");
    expect(html).toContain("回程时雨停了");
    expect(html).toContain("岛上散步者");
  });

  it("旧快照 memories=[] 时不显示讲述区块", () => {
    const stop: ShowStop = { ...stopWithMemories(), photo: createPublicPhotoFixture("photo-2", "黄昏") };
    const html = renderToStaticMarkup(
      <PhotoLightbox
        stops={[stop]}
        lightbox={{ index: 0, direction: "none" }}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(html).not.toContain("来自共同投稿的讲述");
  });
});
